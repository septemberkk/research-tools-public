// Minimal checker-only I/O. No palette or category-mapping dependency.
export const MAX_CHARACTERS = 10000000;

export async function readUtf8File(file) {
  if (file.size > MAX_CHARACTERS * 4) throw new Error('Choose a file smaller than 40 MB.');
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('File is not valid UTF-8. Export a UTF-8 CSV or TSV first; current input is unchanged.'); }
}

export function assertSpreadsheetSafe(value, context = 'Cell') {
  const text = String(value ?? '');
  if (/^[\s]*[=+@]/u.test(text) || /^[\s]*-(?!\d+(?:\.\d+)?\s*$)/u.test(text)) {
    throw new Error(`${context}: a formula-like value cannot be exported safely.`);
  }
}

export function serializeTableCsv(table) {
  const encode = value => {
    const text = String(value ?? '');
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [table.header, ...table.rows].map(row => row.map(encode).join(',')).join('\n') + '\n';
}
