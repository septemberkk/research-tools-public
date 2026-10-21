import { parseTableCsv, serializeTableCsv, assertSpreadsheetSafe, MAX_CHARACTERS, MAX_ROWS } from './csv.js';

export const MIN_CATEGORIES = 1;
export const MAX_CATEGORIES = 100;
export const MAPPING_SCHEMA = 'research-tools/category-colors';
export const normalizeCategoryKey = value => String(value ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu, '');

export function normalizeHex(value) {
  const text = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) return '#' + [...text].map(char => char.repeat(2)).join('').toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return '#' + text.toUpperCase();
  throw new Error('Use a 3- or 6-digit HEX colour.');
}

export function validateMapping(rows) {
  if (!Array.isArray(rows) || rows.length < MIN_CATEGORIES || rows.length > MAX_CATEGORIES) throw new Error(`Use ${MIN_CATEGORIES}–${MAX_CATEGORIES} categories.`);
  const names = new Set();
  return rows.map((row, index) => {
    const issue = (message, field) => Object.assign(new Error(message), { rowIndex: index, field });
    if (row?.category !== undefined && typeof row.category !== 'string') throw issue(`Category ${index + 1}: use a text key, not a number or other value.`, 'category');
    const category = normalizeCategoryKey(row?.category);
    if (!category.trim()) throw issue(`Category ${index + 1} needs a name.`, 'category');
    if (category.length > 60 || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(category)) throw issue(`Category ${index + 1}: use a name of up to 60 characters on one line.`, 'category');
    if (/^[=+@-]/u.test(category)) throw issue(`Category ${index + 1}: do not start with =, +, -, or @ (spreadsheet safety).`, 'category');
    if (names.has(category)) throw issue(`Category names must be unique: “${category}”.`, 'category');
    names.add(category);
    let color_hex;
    try { color_hex = normalizeHex(row?.color_hex); }
    catch { throw issue(`Category ${index + 1}: use a valid HEX colour.`, 'color_hex'); }
    return { category, color_hex };
  });
}

export function mappingWarnings(rows) {
  const mapping = validateMapping(rows);
  const warnings = [];
  const colors = new Map(), folded = new Map();
  for (const row of mapping) {
    if (colors.has(row.color_hex)) warnings.push(`“${row.category}” and “${colors.get(row.color_hex)}” share ${row.color_hex}.`);
    else colors.set(row.color_hex, row.category);
    const key = row.category.toLowerCase();
    if (folded.has(key)) warnings.push(`“${row.category}” and “${folded.get(key)}” differ only in case; they remain different keys.`);
    else folded.set(key, row.category);
  }
  return warnings;
}

export function mappingConfig(rows, name = 'category-colours') {
  const mapping_name = String(name).trim();
  if (!mapping_name || mapping_name.length > 100 || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(mapping_name)) throw new Error('Use a mapping name of 1–100 characters on one line.');
  return { schema: MAPPING_SCHEMA, schema_version: 1, mapping_name, mapping: validateMapping(rows) };
}

export function parseMapping(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Choose or paste a JSON / CSV mapping first.');
  if (input.length > MAX_CHARACTERS) throw new Error('Keep the mapping under 10 million characters.');
  const text = input.replace(/^\uFEFF/, '').trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The mapping is not valid JSON.'); }
    if (data?.schema !== undefined && (data.schema !== MAPPING_SCHEMA || data.schema_version !== 1)) throw new Error('Unsupported mapping schema or version. Use category-colors version 1.');
    if (data?.schema === undefined && data?.schema_version !== undefined) throw new Error('The versioned mapping needs its schema identifier.');
    const config = mappingConfig(data?.mapping, data?.mapping_name ?? data?.palette_name ?? 'imported-colours');
    return { ...config, duplicate_rows_collapsed: 0, source_format: 'json' };
  }
  const table = parseTableCsv(text);
  if (['category', 'color_hex', 'Primary_module_final', 'Primary_fill_color_hex'].every(name => table.header.includes(name))) throw new Error('Ambiguous mapping columns. Keep either the generic category/color pair or the Cytoscape module/color pair, not both.');
  let key, color;
  if (table.header.includes('category') && table.header.includes('color_hex')) { key = 'category'; color = 'color_hex'; }
  else if (table.header.includes('Primary_module_final') && table.header.includes('Primary_fill_color_hex')) { key = 'Primary_module_final'; color = 'Primary_fill_color_hex'; }
  else throw new Error('CSV needs category,color_hex or Primary_module_final,Primary_fill_color_hex columns.');
  const seen = new Map();
  let duplicate_rows_collapsed = 0;
  table.rows.forEach((row, index) => {
    const normalized = validateMapping([{ category: row[table.header.indexOf(key)], color_hex: row[table.header.indexOf(color)] }])[0];
    if (seen.has(normalized.category)) {
      if (seen.get(normalized.category).color_hex !== normalized.color_hex) throw new Error(`Mapping conflict at data row ${index + 1}: “${normalized.category}” has both ${seen.get(normalized.category).color_hex} and ${normalized.color_hex}. Resolve the conflict before importing.`);
      duplicate_rows_collapsed++;
    } else seen.set(normalized.category, normalized);
  });
  return { ...mappingConfig([...seen.values()], 'imported-colours'), duplicate_rows_collapsed, source_format: 'csv' };
}

export function buildMappingExports(rows, name = 'category-colours') {
  const config = mappingConfig(rows, name);
  const mapping = config.mapping;
  const quote = value => JSON.stringify(value);
  // ASCII source avoids platform-locale decoding failures in R. Use full code points, not surrogate pairs.
  const quoteR = value => quote(value).replace(/[^\x00-\x7f]/gu, char => {
    const code = char.codePointAt(0);
    return code <= 0xffff ? `\\u${code.toString(16).padStart(4, '0')}` : `\\U${code.toString(16).padStart(8, '0')}`;
  });
  const textExport = (text, extension, mime = 'text/plain;charset=utf-8') => ({ text, extension, mime });
  return {
    hex: textExport(mapping.map(row => row.color_hex).join('\n') + '\n', 'txt'),
    r: textExport('# Keys, not row positions, define the colours. Unknown categories stop with an error.\ncategory_colors <- stats::setNames(\n' +
      `  c(${mapping.map(row => quoteR(row.color_hex)).join(', ')}),\n  c(${mapping.map(row => quoteR(row.category)).join(', ')})\n)\n\n` +
      'category_keys <- function(categories) {\n  if (is.factor(categories)) categories <- as.character(categories)\n  if (!is.character(categories)) stop("Use text category keys; convert numeric identifiers explicitly.")\n  keys <- trimws(categories)\n  unknown <- unique(keys[is.na(keys) | !keys %in% names(category_colors)])\n  if (length(unknown)) stop(paste("No colour for:", paste(unknown, collapse = ", ")))\n  keys\n}\n\ncolors_for <- function(categories) {\n  unname(category_colors[category_keys(categories)])\n}\n\n', 'R'),
    python: textExport('# Keys, not row positions, define the colours. Unknown categories stop with an error.\ncategory_colors = {\n' +
      mapping.map(row => `    ${quote(row.category)}: ${quote(row.color_hex)},`).join('\n') + '\n}\n\n' +
      'def category_keys(categories):\n    keys = list(categories)\n    if any(not isinstance(value, str) for value in keys):\n        raise TypeError("Use text category keys; convert numeric identifiers explicitly.")\n    keys = [value.strip(" \\t\\r\\n") for value in keys]\n    unknown = list(dict.fromkeys(key for key in keys if key not in category_colors))\n    if unknown:\n        raise ValueError("No colour for: " + ", ".join(unknown))\n    return keys\n\ndef colors_for(categories):\n    return [category_colors[key] for key in category_keys(categories)]\n\n', 'py'),
    json: textExport(JSON.stringify(config, null, 2) + '\n', 'json', 'application/json;charset=utf-8'),
    csv: textExport(serializeTableCsv({ header: ['category', 'color_hex'], rows: mapping.map(row => [row.category, row.color_hex]) }), 'csv', 'text/csv;charset=utf-8'),
    cytoscape: textExport(serializeTableCsv({ header: ['Primary_module_final', 'Module_name_final', 'Primary_fill_color_hex'], rows: mapping.map(row => [row.category, row.category, row.color_hex]) }), 'csv', 'text/csv;charset=utf-8'),
  };
}

export function applyMappingToTable(input, rows, { categoryColumn, colorColumn = 'color_hex', replaceConflicts = false, emptyCategory = null } = {}) {
  if (typeof replaceConflicts !== 'boolean') throw new Error('Replacement permission must be explicitly true or false.');
  if (typeof colorColumn === 'string') colorColumn = colorColumn.trim();
  const mapping = validateMapping(rows);
  const source = typeof input === 'string' ? parseTableCsv(input) : input;
  if (!source || !Array.isArray(source.header) || !Array.isArray(source.rows) || !source.rows.length || source.rows.length > MAX_ROWS) throw new Error('Provide a nonempty CSV table of up to 50,000 rows.');
  if (new Set(source.header).size !== source.header.length || source.header.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Use unique, nonempty CSV headers.');
  const keyIndex = source.header.indexOf(categoryColumn);
  if (keyIndex < 0) throw new Error(`Category column “${categoryColumn ?? ''}” was not found. Column names are case-sensitive.`);
  if (typeof colorColumn !== 'string' || !colorColumn.trim() || /[\r\n\u0000]/u.test(colorColumn) || colorColumn === categoryColumn) throw new Error('Use a separate, nonempty colour column on one line.');
  assertSpreadsheetSafe(colorColumn, 'Colour column name');
  source.header.forEach(value => assertSpreadsheetSafe(value, 'CSV header'));
  const header = [...source.header];
  let colorIndex = header.indexOf(colorColumn);
  if (colorIndex < 0) { colorIndex = header.length; header.push(colorColumn); }
  const lookup = new Map(mapping.map(row => [row.category, row.color_hex]));
  const used = new Set(), unknown = new Set(), conflicts = [], changes = [];
  let filled = 0, replaced = 0, unchanged = 0;
  const outputRows = source.rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== source.header.length) throw new Error(`Data row ${index + 1} has the wrong number of columns.`);
    row.forEach((value, column) => assertSpreadsheetSafe(value, `Data row ${index + 1}, ${source.header[column]}`));
    const category = normalizeCategoryKey(row[keyIndex]) || emptyCategory;
    const output = [...row];
    const expected = lookup.get(category);
    if (!expected) { unknown.add(category ?? '(empty)'); return output; }
    used.add(category);
    const previous = String(row[colorIndex] ?? '').trim();
    let normalized = null;
    try { normalized = previous ? normalizeHex(previous) : null; } catch { /* Invalid existing colours are conflicts, never silent defaults. */ }
    if (!previous) filled++;
    else if (normalized === expected) unchanged++;
    else {
      const change = { data_row: index + 1, category, previous_color: previous, mapped_color: expected };
      if (!replaceConflicts) conflicts.push(change);
      else { replaced++; changes.push(change); }
    }
    output[colorIndex] = expected;
    return output;
  });
  if (unknown.size || conflicts.length) {
    const messages = [];
    if (unknown.size) messages.push(`Unmapped categories: ${[...unknown].slice(0, 8).join(', ')}${unknown.size > 8 ? ' …' : ''}. Add them to the mapping; colours are not assigned by row order.`);
    if (conflicts.length) messages.push(`${conflicts.length} existing colour conflict(s). First: “${conflicts[0].category}” at data row ${conflicts[0].data_row} is ${conflicts[0].previous_color}, mapping requires ${conflicts[0].mapped_color}. Explicitly allow replacement or resolve it first.`);
    throw Object.assign(new Error(messages.join(' ')), { unknown_categories: [...unknown], conflicts });
  }
  return {
    table: { header, rows: outputRows },
    report: { matching_policy: 'trimmed-case-sensitive', conflict_policy: replaceConflicts ? 'replace-explicitly' : 'block', category_column: categoryColumn, color_column: colorColumn, matched_rows: outputRows.length, filled_colors: filled, unchanged_colors: unchanged, replaced_colors: replaced, unused_categories: mapping.filter(row => !used.has(row.category)).map(row => row.category), replacements: changes },
  };
}

export function mappingCanonicalText(rows) {
  return JSON.stringify(validateMapping(rows).sort((a, b) => a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

export async function sha256(text) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
