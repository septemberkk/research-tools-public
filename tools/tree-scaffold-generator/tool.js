// Browser-only scaffold builder. It never sends input to a server or writes to disk.
const BRANCH = /^((?:(?:│|\|) {3}| {4})*)(?:├──|└──|\|--|\+--|`--)\s*(.+)$/u;
const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/u;
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function parseTree(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Paste a file tree first.');
  if (input.length > 20000) throw new Error('Keep the tree under 20,000 characters.');
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(item => item.text.trim() && !item.text.trim().startsWith('```'));
  if (!lines.length || lines.length > 250) throw new Error('Use between 1 and 250 tree entries.');

  const firstBranch = BRANCH.test(lines[0].text);
  const hasRoot = !firstBranch;
  const nodes = lines.map((item, index) => {
    const branch = item.text.match(BRANCH);
    if (!branch && (index !== 0 || !hasRoot || !item.text.trim().endsWith('/'))) {
      throw new Error(`Line ${item.line}: use a folder root ending in / or a standard tree branch.`);
    }
    const depth = branch ? branch[1].length / 4 + (hasRoot ? 1 : 0) : 0;
    return { line: item.line, depth, rawName: branch ? branch[2].trim() : item.text.trim() };
  });
  if (nodes.length > 250) throw new Error('Use no more than 250 entries.');

  const entries = [];
  const stack = [];
  const seen = new Set();
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const isDir = node.rawName.endsWith('/') || (nodes[index + 1]?.depth > node.depth);
    const name = isDir && node.rawName.endsWith('/') ? node.rawName.slice(0, -1) : node.rawName;
    if (!name || name === '.' || name === '..' || name.endsWith(' ') || name.endsWith('.') ||
        name.length > 150 || INVALID_NAME.test(name) || RESERVED_NAME.test(name)) {
      throw new Error(`Line ${node.line}: invalid file or folder name.`);
    }
    const parent = node.depth ? stack[node.depth - 1] : null;
    if (node.depth && (!parent || !parent.isDir)) {
      throw new Error(`Line ${node.line}: a parent folder is missing.`);
    }
    const path = (parent ? parent.path : '') + name + (isDir ? '/' : '');
    if (seen.has(path.toLowerCase())) throw new Error(`Line ${node.line}: duplicate path.`);
    seen.add(path.toLowerCase());
    const entry = { path, isDir };
    entries.push(entry);
    stack[node.depth] = entry;
    stack.length = node.depth + 1;
  }
  return entries;
}

// Empty files have zero CRC and require no compression or third-party library.
export function buildZip(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 250) throw new Error('Preview a valid tree first.');
  const encoder = new TextEncoder();
  const names = entries.map(entry => encoder.encode(entry.path));
  if (names.some(name => name.length > 65535)) throw new Error('A path is too long for ZIP.');
  const localSize = names.reduce((sum, name) => sum + 30 + name.length, 0);
  const centralSize = names.reduce((sum, name) => sum + 46 + name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  const put16 = (offset, value) => view.setUint16(offset, value, true);
  const put32 = (offset, value) => view.setUint32(offset, value, true);
  let cursor = 0;
  const offsets = [];

  for (const name of names) {
    offsets.push(cursor);
    put32(cursor, 0x04034b50);
    put16(cursor + 4, 20);
    put16(cursor + 6, 0x0800);
    put16(cursor + 8, 0);
    put16(cursor + 10, 0);
    put16(cursor + 12, 33);
    put16(cursor + 26, name.length);
    bytes.set(name, cursor + 30);
    cursor += 30 + name.length;
  }
  for (let index = 0; index < entries.length; index++) {
    const name = names[index];
    put32(cursor, 0x02014b50);
    put16(cursor + 4, 20);
    put16(cursor + 6, 20);
    put16(cursor + 8, 0x0800);
    put16(cursor + 10, 0);
    put16(cursor + 12, 0);
    put16(cursor + 14, 33);
    put16(cursor + 28, name.length);
    put32(cursor + 38, entries[index].isDir ? 0x10 : 0);
    put32(cursor + 42, offsets[index]);
    bytes.set(name, cursor + 46);
    cursor += 46 + name.length;
  }
  put32(cursor, 0x06054b50);
  put16(cursor + 8, entries.length);
  put16(cursor + 10, entries.length);
  put32(cursor + 12, centralSize);
  put32(cursor + 16, localSize);
  return new Blob([bytes], { type: 'application/zip' });
}

function init() {
  const input = document.getElementById('tree-input');
  const previewButton = document.getElementById('tree-preview-button');
  const downloadButton = document.getElementById('tree-download-button');
  const preview = document.getElementById('tree-preview');
  const placeholder = document.getElementById('tree-preview-placeholder');
  const status = document.getElementById('tree-status');
  let current = null;

  input.addEventListener('input', () => {
    current = null;
    downloadButton.disabled = true;
    preview.hidden = true;
    placeholder.hidden = false;
    status.dataset.error = 'false';
    status.textContent = 'Preview the updated tree before downloading.';
  });
  previewButton.addEventListener('click', () => {
    try {
      current = parseTree(input.value);
      preview.textContent = current.map(entry => `${entry.isDir ? 'Folder' : 'File  '}  ${entry.path}`).join('\n');
      preview.hidden = false;
      placeholder.hidden = true;
      downloadButton.disabled = false;
      status.dataset.error = 'false';
      status.textContent = `Ready: ${current.filter(entry => entry.isDir).length} folders and ${current.filter(entry => !entry.isDir).length} empty files.`;
    } catch (error) {
      current = null;
      downloadButton.disabled = true;
      preview.hidden = true;
      placeholder.hidden = false;
      status.dataset.error = 'true';
      status.textContent = error.message;
    }
  });
  downloadButton.addEventListener('click', () => {
    if (!current) return;
    const archive = buildZip(current);
    const root = current[0].path.split('/')[0].replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'project';
    const url = URL.createObjectURL(archive);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${root}-scaffold.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = 'ZIP downloaded. Review its paths before extracting.';
  });
}

if (typeof document !== 'undefined') init();
