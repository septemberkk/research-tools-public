export const MAX_CHARACTERS = 10000000;
export const MAX_ROWS = 50000;
const MAX_COLUMNS = 200;

export async function readUtf8File(file) {
  if (file.size > MAX_CHARACTERS * 4) throw new Error('Choose a file smaller than 40 MB.');
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('File is not valid UTF-8. Export a UTF-8 JSON or CSV first; current input is unchanged.'); }
}

export function parseTableCsv(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Paste or choose a CSV file first.');
  if (input.length > MAX_CHARACTERS) throw new Error('Keep the CSV under 10 million characters.');
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, afterQuote = false, atStart = true, line = 1, rowHasCsvSyntax = false;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    atStart = true;
    afterQuote = false;
    if (row.length > MAX_COLUMNS) throw new Error(`Line ${line}: use no more than ${MAX_COLUMNS} columns.`);
  };
  const finishRow = () => {
    finishCell();
    if (rowHasCsvSyntax || row.some(value => value.trim())) rows.push(row);
    row = [];
    rowHasCsvSyntax = false;
    if (rows.length > MAX_ROWS + 1) throw new Error(`Use no more than ${MAX_ROWS} data rows.`);
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; afterQuote = true; }
      } else { cell += char; if (char === '\n') line++; }
      continue;
    }
    if (afterQuote && ![',', '\r', '\n'].includes(char)) throw new Error(`Line ${line}: unexpected text after a closing quote.`);
    if (char === ',') { rowHasCsvSyntax = true; finishCell(); }
    else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && source[index + 1] === '\n') index++;
      line++;
    } else if (char === '"' && atStart) { rowHasCsvSyntax = true; quoted = true; atStart = false; }
    else if (char === '"') throw new Error(`Line ${line}: quotes inside a field must be doubled.`);
    else { cell += char; atStart = false; }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field.');
  if (cell || row.length || afterQuote) finishRow();
  if (rows.length < 2) throw new Error('The CSV needs a header and at least one data row.');
  const header = rows.shift().map(value => value.trim());
  if (header.some(value => !value)) throw new Error('CSV headers cannot be empty.');
  if (new Set(header).size !== header.length) throw new Error('CSV headers must be unique.');
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].length !== header.length) throw new Error(`Data row ${index + 1} has ${rows[index].length} columns; expected ${header.length}.`);
  }
  return { header, rows };
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
