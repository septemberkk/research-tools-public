import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProjectStarter, formatStarterTree, PROJECT_TYPES, REGISTRY_COLUMNS, ARTIFACT_COLUMNS } from '../tools/tree-scaffold-generator/project-starter-model.js';
import { buildContentZip, crc32 } from '../tools/tree-scaffold-generator/content-zip.js';

const options = { projectType: 'data-analysis', rootName: 'research-demo', title: 'Research demo', question: 'A synthetic planning question?' };
const file = (bundle, path) => bundle.entries.find(entry => entry.path === bundle.rootName + '/' + path)?.content;
const text = value => new TextEncoder().encode(value);

for (const [projectType, preset] of Object.entries(PROJECT_TYPES)) {
  test(`${projectType} has populated planning templates and no fabricated experiments`, () => {
    const bundle = buildProjectStarter({ ...options, projectType });
    assert.equal(bundle.entries[0].path, 'research-demo/');
    assert.equal(bundle.fileCount, 15);
    assert.equal(bundle.folderCount, bundle.entries.filter(entry => entry.isDir).length);
    for (const dir of ['data/raw/', 'data/processed/', 'config/', 'results/staging/', 'results/active/', 'tests/smoke/', ...preset.directories]) {
      assert.ok(bundle.entries.some(entry => entry.path === 'research-demo/' + dir && entry.isDir), dir);
    }
    assert.match(file(bundle, 'README.md'), /PLANNING \/ NOT_RUN/);
    assert.match(file(bundle, 'README.md'), /No runnable generator/);
    assert.match(file(bundle, 'PROJECT_STATE.md'), /Not assigned/);
    assert.match(file(bundle, 'docs/methods/PLAN.md'), /PLANNED \/ NOT_RUN/);
    assert.equal(file(bundle, 'metadata/EXPERIMENT_REGISTRY.csv'), REGISTRY_COLUMNS.join(',') + '\n');
    assert.equal(file(bundle, 'metadata/ARTIFACT_MANIFEST.csv'), ARTIFACT_COLUMNS.join(',') + '\n');
    assert.ok(bundle.entries.every(entry => entry.isDir || entry.content.length > 0));
    assert.ok(!bundle.entries.some(entry => /\.(py|ipynb|r)$/iu.test(entry.path)));
    assert.equal(JSON.parse(file(bundle, 'config/project.json')).canonical_id, null);
    const metadata = JSON.parse(file(bundle, 'metadata/templates/run_metadata.json'));
    assert.equal(metadata.template_only, true);
    assert.equal(metadata.execution_status, 'NOT_RUN');
    assert.equal(metadata.started_at_utc, null);
    assert.equal(metadata.git.commit, null);
    assert.deepEqual(metadata.inputs, []);
    assert.equal(bundle.entries.filter(entry => entry.path.includes('E001')).length, 0);
  });
}

test('registry includes historical provenance and both execution and outcome fields', () => {
  assert.equal(REGISTRY_COLUMNS.length, 26);
  assert.equal(ARTIFACT_COLUMNS.length, 11);
  for (const column of ['historical_id', 'historical_order', 'first_run_timestamp', 'historical_source_status', 'execution_status', 'scientific_outcome', 'lifecycle_status']) {
    assert.ok(REGISTRY_COLUMNS.includes(column));
  }
});

test('all folders have explicit parents and file/directory paths are unique', () => {
  for (const projectType of Object.keys(PROJECT_TYPES)) {
    const bundle = buildProjectStarter({ ...options, projectType });
    const paths = new Map(bundle.entries.map(entry => [entry.path.replace(/\/$/u, ''), entry]));
    assert.equal(paths.size, bundle.entries.length);
    for (const entry of bundle.entries.slice(1)) {
      const parts = entry.path.replace(/\/$/u, '').split('/');
      parts.pop();
      assert.equal(paths.get(parts.join('/'))?.isDir, true, entry.path);
    }
  }
});

test('Unicode titles/questions remain exact in JSON but literal in Markdown', () => {
  const title = '认知研究 <script> & **标题**';
  const question = '# Not a heading\n<script>alert(1)</script>\n[link](https://invalid.example)';
  const bundle = buildProjectStarter({ ...options, title, question });
  assert.equal(JSON.parse(file(bundle, 'config/project.json')).project_name, title);
  assert.equal(JSON.parse(file(bundle, 'config/project.json')).scientific_question, question);
  assert.match(file(bundle, 'README.md'), /认知研究/);
  assert.doesNotMatch(file(bundle, 'README.md'), /<script>/);
  assert.match(file(bundle, 'docs/methods/PLAN.md'), /> \\# Not a heading/);
  assert.ok(file(bundle, 'README.md').includes('\\*\\*标题\\*\\*'));
});

test('blank question stays explicitly undefined, with no inference or generated scientific result', () => {
  const bundle = buildProjectStarter({ ...options, question: '' });
  assert.match(file(bundle, 'README.md'), /Not defined yet/);
  assert.equal(JSON.parse(file(bundle, 'config/project.json')).scientific_question, null);
  assert.match(file(bundle, 'PROJECT_STATE.md'), /NOT_YET_EVALUATED/);
});

test('folder and project type validation reject unsafe or misleading names', () => {
  for (const rootName of ['', '../demo', '/demo', 'C:demo', 'has space', '中文', 'a.b', '1-demo', 'CON', 'con', 'lpt1', 'com9', 'x'.repeat(65), 'a\\b']) {
    assert.throws(() => buildProjectStarter({ ...options, rootName }), /lowercase/);
  }
  for (const projectType of ['unknown', '__proto__', 'constructor', null]) {
    assert.throws(() => buildProjectStarter({ ...options, projectType }), /supported/);
  }
  assert.throws(() => buildProjectStarter(null), /settings/);
  assert.throws(() => buildProjectStarter({ ...options, rootName: 1 }), /folder/);
});

test('invalid title/question lengths, types and controls do not get silently exported', () => {
  for (const title of ['', ' ', 'a\nb', 'a\u0000b', 'x'.repeat(121), '\ud800', 42]) {
    assert.throws(() => buildProjectStarter({ ...options, title }), /title/);
  }
  for (const question of ['x'.repeat(2001), 'a\u0000b', '\ud800', 42]) {
    assert.throws(() => buildProjectStarter({ ...options, question }), /question/);
  }
});

test('input is not mutated and generated contents and tree order are deterministic', async () => {
  const input = Object.freeze({ ...options });
  const a = buildProjectStarter(input);
  const b = buildProjectStarter(input);
  assert.deepEqual(a, b);
  assert.deepEqual(new Uint8Array(await buildContentZip(a.entries).arrayBuffer()), new Uint8Array(await buildContentZip(b.entries).arrayBuffer()));
  assert.match(formatStarterTree(a.entries), /^research-demo\//);
  assert.match(formatStarterTree(a.entries), /    EXPERIMENT_REGISTRY.csv/);
  assert.equal(input.rootName, 'research-demo');
});

test('CRC-32 matches the standard check value and an empty payload', () => {
  assert.equal(crc32(text('123456789')), 0xcbf43926);
  assert.equal(crc32(text('')), 0);
});

test('content ZIP stores UTF-8 text, sizes and matching central directory records', async () => {
  const entries = [{ path: 'demo/', isDir: true }, { path: 'demo/标题.md', isDir: false, content: '内容\n123456789' }];
  const blob = buildContentZip(entries);
  assert.equal(blob.type, 'application/zip');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let offset = 0;
  const offsets = [];
  for (const entry of entries) {
    offsets.push(offset);
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    assert.equal(view.getUint16(offset + 6, true), 0x0800);
    assert.equal(view.getUint16(offset + 8, true), 0);
    const nameLength = view.getUint16(offset + 26, true);
    const size = view.getUint32(offset + 22, true);
    const content = text(entry.content || '');
    assert.equal(view.getUint32(offset + 18, true), content.length);
    assert.equal(size, content.length);
    assert.equal(view.getUint32(offset + 14, true), crc32(content));
    assert.equal(decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength)), entry.path);
    assert.deepEqual(bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + size), content);
    offset += 30 + nameLength + size;
  }
  const centralOffset = offset;
  for (let index = 0; index < entries.length; index++) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    assert.equal(view.getUint16(offset + 8, true), 0x0800);
    assert.equal(view.getUint32(offset + 42, true), offsets[index]);
    assert.equal(view.getUint32(offset + 16, true), crc32(text(entries[index].content || '')));
    offset += 46 + view.getUint16(offset + 28, true);
  }
  assert.equal(view.getUint32(offset, true), 0x06054b50);
  assert.equal(view.getUint16(offset + 8, true), entries.length);
  assert.equal(view.getUint16(offset + 10, true), entries.length);
  assert.equal(view.getUint32(offset + 16, true), centralOffset);
  assert.equal(view.getUint32(offset + 12, true), offset - centralOffset);
  assert.equal(offset + 22, bytes.length);
});

test('content ZIP rejects traversal, absolute paths and unsafe Windows names', () => {
  for (const path of ['../a', '/a', 'a//b', 'a/../b', 'a/./b', 'a\\b', 'a:b', 'a/CON.txt', 'a/lpt¹', 'a/b.', 'a/b ', 'a/\u0000b', 'a/'.repeat(2)]) {
    assert.throws(() => buildContentZip([{ path, isDir: false, content: '' }]));
  }
  assert.throws(() => buildContentZip([{ path: '\ud800', isDir: false, content: '' }]));
});

test('content ZIP rejects file/folder collisions and invalid payloads', () => {
  const f = (path, content = '') => ({ path, isDir: false, content });
  assert.throws(() => buildContentZip([f('a'), f('A')]), /Duplicate/);
  assert.throws(() => buildContentZip([f('a'), { path: 'a/', isDir: true }]), /conflicting/);
  assert.throws(() => buildContentZip([f('a'), f('a/b')]), /parent/);
  assert.throws(() => buildContentZip([f('a/b'), f('a')]), /parent/);
  assert.throws(() => buildContentZip([{ path: 'a/', isDir: true, content: 'not empty' }]), /Folders/);
  assert.throws(() => buildContentZip([{ path: 'a', isDir: false }]), /Files/);
  assert.throws(() => buildContentZip([f('a', '\ud800')]), /text/);
  assert.throws(() => buildContentZip([{ path: 'a', isDir: true }]), /path/);
});

test('content ZIP caps entry count, payload and whole-archive size', () => {
  assert.throws(() => buildContentZip([]), /250/);
  assert.throws(() => buildContentZip(Array.from({ length: 251 }, (_, index) => ({ path: `f${index}`, isDir: false, content: '' }))), /250/);
  assert.throws(() => buildContentZip([{ path: 'a', isDir: false, content: 'x'.repeat(128 * 1024 + 1) }]), /too large/);
  assert.throws(() => buildContentZip(Array.from({ length: 8 }, (_, index) => ({ path: `f${index}`, isDir: false, content: 'x'.repeat(128 * 1024) }))), /1 MiB/);
});

test('starter is an integrated tab with explicit planning and privacy copy', async () => {
  const html = await readFile(new URL('../tools/tree-scaffold-generator/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../tools/tree-scaffold-generator/project-starter.js', import.meta.url), 'utf8');
  for (const [, id] of script.matchAll(/find\('([^']+)'\)/gu)) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /role="tablist"/);
  assert.match(html, /id="project-starter-panel"[\s\S]*?hidden>/);
  assert.match(html, /Text tree mode creates empty files only/);
  assert.match(html, /Registries contain headers only/);
  assert.match(html, /not the full project-governance package/);
  assert.match(script, /#research-project-starter/);
  assert.doesNotMatch(script, /innerHTML|outerHTML|eval\(/);
});
