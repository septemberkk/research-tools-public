import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTree, buildZip } from '../tools/tree-scaffold-generator/tool.js';

const example = `project-name/
├── README.md
├── docs/
│   └── index.md
└── src/
    └── package/
        └── __init__.py`;

test('file tree parser preserves nested folders and empty file paths', () => {
  assert.deepEqual(parseTree(example), [
    { path: 'project-name/', isDir: true },
    { path: 'project-name/README.md', isDir: false },
    { path: 'project-name/docs/', isDir: true },
    { path: 'project-name/docs/index.md', isDir: false },
    { path: 'project-name/src/', isDir: true },
    { path: 'project-name/src/package/', isDir: true },
    { path: 'project-name/src/package/__init__.py', isDir: false },
  ]);
  assert.deepEqual(parseTree('```text\nproject/\n└── src\n    └── main.py\n```'), [
    { path: 'project/', isDir: true },
    { path: 'project/src/', isDir: true },
    { path: 'project/src/main.py', isDir: false },
  ]);
});

test('file tree parser rejects traversal, unsafe names, missing parents, and duplicates', () => {
  for (const text of [
    'project/\n└── ../',
    'project/\n└── CON.txt',
    'project/\n└── file:name',
    'project/\n    └── missing-parent.txt',
    'project/\n├── notes.md\n└── NOTES.md',
  ]) assert.throws(() => parseTree(text));
});

test('browser ZIP stores the exact empty scaffold paths', async () => {
  const entries = parseTree(example);
  const bytes = new Uint8Array(await buildZip(entries).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let offset = 0;
  const names = [];
  for (const entry of entries) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    assert.equal(view.getUint32(offset + 18, true), 0);
    const length = view.getUint16(offset + 26, true);
    names.push(decoder.decode(bytes.subarray(offset + 30, offset + 30 + length)));
    offset += 30 + length;
  }
  assert.deepEqual(names, entries.map(entry => entry.path));
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 14, true), entries.length);
  const page = await readFile(new URL('../tools/tree-scaffold-generator/index.html', import.meta.url), 'utf8');
  assert.match(page, /Your text stays in this browser/);
  assert.match(page, /src="tool\.js"/);
});
