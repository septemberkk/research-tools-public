// Small, stored ZIPs for browser-generated text templates. No compression or I/O.
const ENCODER = new TextEncoder();
const INVALID_SEGMENT = /[<>:"\\|?*\u0000-\u001f\u007f]/u;
const RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;
const MAX_BYTES = 1024 * 1024;
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

export function buildContentZip(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 250) {
    throw new Error('Use between 1 and 250 archive entries.');
  }
  const seen = new Map();
  const records = entries.map(entry => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.isDir !== 'boolean' ||
        !entry.path.isWellFormed() || entry.path.startsWith('/') ||
        entry.path.endsWith('/') !== entry.isDir) throw new Error('Invalid archive path.');
    const cleanPath = entry.isDir ? entry.path.slice(0, -1) : entry.path;
    const segments = cleanPath.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..' ||
        segment.length > 150 || /[ .]$/u.test(segment) ||
        INVALID_SEGMENT.test(segment) || RESERVED_SEGMENT.test(segment))) {
      throw new Error('Archive paths must use safe relative file and folder names.');
    }
    const key = cleanPath.toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate or conflicting archive path.');
    seen.set(key, entry.isDir);
    if (entry.isDir && entry.content !== undefined && entry.content !== '') {
      throw new Error('Folders cannot contain file data.');
    }
    if (!entry.isDir && (typeof entry.content !== 'string' || !entry.content.isWellFormed())) {
      throw new Error('Files must contain well-formed text.');
    }
    const name = ENCODER.encode(entry.path);
    const data = ENCODER.encode(entry.isDir ? '' : entry.content);
    if (name.length > 65535 || data.length > 128 * 1024) throw new Error('An archive entry is too large.');
    return { name, data, crc: crc32(data), isDir: entry.isDir, segments };
  });
  for (const record of records) {
    for (let count = 1; count < record.segments.length; count++) {
      const parent = record.segments.slice(0, count).join('/').toLowerCase();
      if (seen.get(parent) === false) throw new Error('A file cannot be a parent folder.');
    }
  }
  const localSize = records.reduce((sum, record) => sum + 30 + record.name.length + record.data.length, 0);
  const centralSize = records.reduce((sum, record) => sum + 46 + record.name.length, 0);
  if (localSize + centralSize + 22 > MAX_BYTES) throw new Error('Keep the complete archive under 1 MiB.');
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  const put16 = (offset, value) => view.setUint16(offset, value, true);
  const put32 = (offset, value) => view.setUint32(offset, value, true);
  let cursor = 0;
  const offsets = [];
  for (const record of records) {
    offsets.push(cursor);
    put32(cursor, 0x04034b50);
    put16(cursor + 4, 20);
    put16(cursor + 6, 0x0800);
    put16(cursor + 12, 33); // Fixed 1980-01-01 ZIP date; not a research timestamp.
    put32(cursor + 14, record.crc);
    put32(cursor + 18, record.data.length);
    put32(cursor + 22, record.data.length);
    put16(cursor + 26, record.name.length);
    bytes.set(record.name, cursor + 30);
    bytes.set(record.data, cursor + 30 + record.name.length);
    cursor += 30 + record.name.length + record.data.length;
  }
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    put32(cursor, 0x02014b50);
    put16(cursor + 4, 20);
    put16(cursor + 6, 20);
    put16(cursor + 8, 0x0800);
    put16(cursor + 14, 33);
    put32(cursor + 16, record.crc);
    put32(cursor + 20, record.data.length);
    put32(cursor + 24, record.data.length);
    put16(cursor + 28, record.name.length);
    put32(cursor + 38, record.isDir ? 0x10 : 0);
    put32(cursor + 42, offsets[index]);
    bytes.set(record.name, cursor + 46);
    cursor += 46 + record.name.length;
  }
  put32(cursor, 0x06054b50);
  put16(cursor + 8, records.length);
  put16(cursor + 10, records.length);
  put32(cursor + 12, centralSize);
  put32(cursor + 16, localSize);
  return new Blob([bytes], { type: 'application/zip' });
}
