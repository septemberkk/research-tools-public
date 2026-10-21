import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, access } from 'node:fs/promises';
import { readUtf8File, assertSpreadsheetSafe, serializeTableCsv, MAX_CHARACTERS } from '../tools/cytoscape-import-table-builder/match-io.js';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const toolFiles = [
  'tools/base.css',
  'tools/cytoscape-import-table-builder/README.md',
  'tools/cytoscape-import-table-builder/index.html',
  'tools/cytoscape-import-table-builder/match-io.js',
  'tools/cytoscape-import-table-builder/table-match-model.js',
  'tools/cytoscape-import-table-builder/table-match.js',
  'tools/cytoscape-import-table-builder/tool.css',
  'tools/cytoscape-import-table-builder/tool.js',
  'tools/tree-scaffold-generator/README.md',
  'tools/tree-scaffold-generator/content-zip.js',
  'tools/tree-scaffold-generator/index.html',
  'tools/tree-scaffold-generator/project-starter-model.js',
  'tools/tree-scaffold-generator/project-starter.js',
  'tools/tree-scaffold-generator/tool.css',
  'tools/tree-scaffold-generator/tool.js',
];
async function walk(path) {
  const entries = await readdir(new URL(path + '/', root), { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path + '/' + entry.name) : [path + '/' + entry.name]));
  return files.flat();
}

test('browser source is exactly the approved two-tool selection', async () => {
  assert.deepEqual((await walk('tools')).sort(), toolFiles.slice().sort());
  for (const path of toolFiles) {
    const source = await read(path);
    assert.doesNotMatch(source, /scientific-palette-explorer|enrichment-mapping-reviewer|category-color-mapping|\.\.\/shared\/|cytoscape-mapping-options/u, path);
    assert.doesNotMatch(source, /(?:^|[\s'"])[A-Za-z]:[\\/]/mu, path);
    assert.doesNotMatch(source, /Private repository|private sci-viz-toolkit only/iu, path);
  }
});

test('runtime modules are local, self-contained and do not upload or persist inputs', async () => {
  for (const path of toolFiles.filter(path => path.endsWith('.js'))) {
    const source = await read(path);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon|\.innerHTML\s*=/u, path);
    for (const [, target] of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/gu)) {
      assert.ok(target.startsWith('./'), path + ': ' + target);
      await access(new URL(target, new URL(path, root)));
    }
  }
});

test('public pages keep existing entry points, integrated tabs and valid local links', async () => {
  const overview = await read('index.html');
  assert.equal((overview.match(/class="toolkit-card"/gu) || []).length, 3);
  assert.match(overview, /Research Project Starter/);
  assert.match(overview, /Table Match Checker/);
  for (const path of ['index.html', ...toolFiles.filter(path => path.endsWith('.html'))]) {
    const html = await read(path);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/iu);
    for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/gu)) {
      if (/^(?:https?:|#|mailto:)/iu.test(value)) continue;
      const target = value.split('#')[0].split('?')[0];
      if (target) await access(new URL(target, new URL(path, root)));
    }
  }
  const checker = await read('tools/cytoscape-import-table-builder/index.html');
  assert.match(checker, /id="cytoscape-builder-panel"/);
  assert.match(checker, /id="table-match-checker"/);
  assert.doesNotMatch(checker, /cytoscape-mapping-enabled|mapping audit/iu);
});

test('original file-tree and annotation generators are byte-equivalent to the existing public baseline', async () => {
  for (const [path, expected] of [
    ['tools/tree-scaffold-generator/tool.js', 'b6b1333bedd94cd24fa24962504222aa171e086d'],
    ['tools/cytoscape-import-table-builder/tool.js', '710ae4930be7ea68ba607eb7599bc1d27770f5dd'],
  ]) {
    const bytes = Buffer.from((await read(path)).replace(/\r\n/gu, '\n'), 'utf8');
    const hash = createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
    assert.equal(hash, expected, path);
  }
});

test('release docs preserve research limits, minimal dependencies and the existing MIT licence', async () => {
  assert.match(await read('tools/tree-scaffold-generator/README.md'), /PLANNING \/ NOT_RUN/);
  assert.match(await read('tools/tree-scaffold-generator/README.md'), /headers only/);
  assert.match(await read('tools/cytoscape-import-table-builder/README.md'), /Native Cytoscape import/);
  assert.match(await read('PUBLIC-SCOPE.md'), /only:/);
  assert.match(await read('LICENSE'), /^MIT License/u);
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs');
});

test('checker-only UTF-8 reader rejects corruption and oversize before decoding', async () => {
  const bytes = new TextEncoder().encode('Gene\n合成示例\n');
  assert.equal(await readUtf8File({ size: bytes.length, arrayBuffer: async () => bytes.buffer }), 'Gene\n合成示例\n');
  await assert.rejects(() => readUtf8File({ size: 2, arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer }), /UTF-8/);
  await assert.rejects(() => readUtf8File({ size: MAX_CHARACTERS * 4 + 1, arrayBuffer: async () => { throw new Error('must not read'); } }), /40 MB/);
});

test('checker-only CSV helper keeps identifiers unchanged and rejects formula-like values', () => {
  for (const value of ['=1+1', ' @SUM(A1)', '+cmd', '-command']) assert.throws(() => assertSpreadsheetSafe(value), /formula-like/);
  for (const value of ['001', '-12', ' A ', '中文']) assert.doesNotThrow(() => assertSpreadsheetSafe(value));
  assert.equal(serializeTableCsv({ header: ['key'], rows: [['001'], [' A '], ['a,b'], ['a"b']] }), 'key\n001\n A \n"a,b"\n"a""b"\n');
});
