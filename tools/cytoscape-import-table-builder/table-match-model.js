import { MAX_CHARACTERS, assertSpreadsheetSafe, serializeTableCsv } from './match-io.js';

export const MATCH_VERSION = '1.0.0';
export const MATCH_SCHEMA = 'sci-viz-toolkit/cytoscape-table-match';
export const MATCH_LIMITS = Object.freeze({ rows: 25000, columns: 200, keyLength: 1000 });
const METHODS = [
  ['trim', value => value.trim()],
  ['case', value => value.toLowerCase()],
  ['trim_case', value => value.trim().toLowerCase()],
];

// Headers are trimmed; data cells, including key whitespace and leading zeros, are not.
// Data-row references exclude the header and truly blank physical lines.
export function parseMatchTable(input, format = 'auto') {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Paste or choose a UTF-8 CSV/TSV table first.');
  if (input.length > MAX_CHARACTERS) throw new Error('Keep each input under 10 million characters.');
  if (!['auto', 'csv', 'tsv'].includes(format)) throw new Error('Choose Auto, CSV, or TSV.');
  const source = input.replace(/^\uFEFF/u, '');
  let quoted = false, tabs = 0, commas = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\r' || char === '\n') break;
      if (char === '\t') tabs++;
      if (char === ',') commas++;
    }
  }
  const delimiter = format === 'tsv' ? '\t' : format === 'csv' ? ',' : tabs > commas ? '\t' : ',';
  const all = [];
  let row = [], cell = '', inQuote = false, afterQuote = false, atStart = true, syntax = false, line = 1;
  function finishCell() {
    row.push(cell); cell = ''; afterQuote = false; atStart = true;
    if (row.length > MATCH_LIMITS.columns) throw new Error('Use no more than 200 columns per table.');
  }
  function finishRow() {
    finishCell();
    if (syntax || row.some(value => value.trim())) all.push(row);
    row = []; syntax = false;
    if (all.length > MATCH_LIMITS.rows + 1) throw new Error('Use no more than 25,000 data rows per table.');
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (inQuote) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++; }
        else { inQuote = false; afterQuote = true; }
      } else { cell += char; if (char === '\n') line++; }
    } else if (afterQuote && ![delimiter, '\r', '\n'].includes(char)) throw new Error(`Line ${line}: unexpected text after a closing quote.`);
    else if (char === delimiter) { syntax = true; finishCell(); }
    else if (char === '\r' || char === '\n') { finishRow(); if (char === '\r' && source[index + 1] === '\n') index++; line++; }
    else if (char === '"' && atStart) { syntax = true; inQuote = true; atStart = false; }
    else if (char === '"') throw new Error(`Line ${line}: quote fields containing double quotes.`);
    else { cell += char; atStart = false; }
  }
  if (inQuote) throw new Error('The table ends inside a quoted field.');
  if (cell || row.length || afterQuote) finishRow();
  if (all.length < 2) throw new Error('A header and at least one data row are required.');
  const header = all.shift().map(value => value.trim());
  if (header.some(value => !value || value.length > 200) || new Set(header).size !== header.length) throw new Error('Headers must be nonempty, unique, and at most 200 characters.');
  const result = { header, rows: all, format: delimiter === '\t' ? 'tsv' : 'csv' };
  validateTable(result);
  return result;
}

function validateTable(table) {
  if (!table || !Array.isArray(table.header) || !Array.isArray(table.rows) || !table.header.length || table.header.length > MATCH_LIMITS.columns || !table.rows.length || table.rows.length > MATCH_LIMITS.rows) throw new Error('Provide a nonempty table with at most 25,000 rows and 200 columns.');
  if (table.header.some(value => typeof value !== 'string' || !value.trim() || value.length > 200) || new Set(table.header).size !== table.header.length) throw new Error('Table headers must be nonempty, unique text.');
  table.rows.forEach((values, index) => {
    if (!Array.isArray(values) || values.length !== table.header.length || values.some(value => typeof value !== 'string')) throw new Error(`Data row ${index + 1}: wrong column count or non-text value.`);
  });
}

function indexKeys(table, keyColumn) {
  validateTable(table);
  const column = table.header.indexOf(keyColumn);
  if (column < 0) throw new Error('Explicitly choose a key column from each table.');
  const groups = new Map(), blanks = [], whitespace = [], invisible = [];
  table.rows.forEach((row, index) => {
    const key = row[column], dataRow = index + 1;
    if (key.length > MATCH_LIMITS.keyLength) throw new Error(`Data row ${dataRow}: keys must be at most 1,000 characters.`);
    if (key !== key.trim()) whitespace.push({ data_row: dataRow, key });
    if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\uFEFF]/u.test(key)) invisible.push({ data_row: dataRow, key });
    if (!key.trim()) { blanks.push({ data_row: dataRow, key }); return; }
    if (!groups.has(key)) groups.set(key, { key, data_rows: [] });
    groups.get(key).data_rows.push(dataRow);
  });
  const duplicates = [];
  for (const group of groups.values()) {
    if (group.data_rows.length < 2) continue;
    const first = table.rows[group.data_rows[0] - 1];
    const changed = table.header.filter((name, index) => index !== column && group.data_rows.some(dataRow => table.rows[dataRow - 1][index] !== first[index]));
    duplicates.push({ ...group, kind: changed.length ? 'conflicting_attributes' : 'identical_rows', differing_columns: changed });
  }
  return { groups, blanks, whitespace, invisible, duplicates, column };
}

function normalizedIndex(groups, transform) {
  const index = new Map();
  for (const key of groups.keys()) {
    const normalized = transform(key);
    if (!index.has(normalized)) index.set(normalized, []);
    index.get(normalized).push(key);
  }
  return index;
}

export function compareMatchTables(network, annotation, { networkKey, annotationKey } = {}) {
  const left = indexKeys(network, networkKey), right = indexKeys(annotation, annotationKey);
  const exact = [], missing = [], unused = [];
  for (const group of left.groups.values()) {
    const partner = right.groups.get(group.key);
    if (partner) exact.push({ key: group.key, network_data_rows: [...group.data_rows], annotation_data_rows: [...partner.data_rows], one_to_one: group.data_rows.length === 1 && partner.data_rows.length === 1 });
    else missing.push({ ...group, data_rows: [...group.data_rows] });
  }
  for (const group of right.groups.values()) if (!left.groups.has(group.key)) unused.push({ ...group, data_rows: [...group.data_rows] });

  // Group diagnostic candidates once, not as a potentially quadratic Cartesian list.
  // All keys enter collision checks, including keys which already match exactly.
  const indexes = METHODS.map(([method, transform]) => ({ method, transform, left: normalizedIndex(left.groups, transform), right: normalizedIndex(right.groups, transform) }));
  const candidates = new Map(), possible = new Set();
  for (const group of missing) {
    for (const index of indexes) {
      const normalized = index.transform(group.key), partners = index.right.get(normalized);
      if (!partners?.length) continue;
      const id = JSON.stringify([index.method, normalized]);
      if (!candidates.has(id)) {
        const networkKeys = index.left.get(normalized), annotationKeys = partners;
        const networkRows = networkKeys.reduce((n, key) => n + left.groups.get(key).data_rows.length, 0);
        const annotationRows = annotationKeys.reduce((n, key) => n + right.groups.get(key).data_rows.length, 0);
        candidates.set(id, { method: index.method, comparison_key: normalized, network_keys: [...networkKeys], annotation_keys: [...annotationKeys], unmatched_network_keys: [], network_row_count: networkRows, annotation_row_count: annotationRows, ambiguous: networkKeys.length !== 1 || annotationKeys.length !== 1 || networkRows !== 1 || annotationRows !== 1, diagnostic_only: true });
      }
      candidates.get(id).unmatched_network_keys.push(group.key);
      possible.add(group.key);
      break;
    }
  }
  const differences = [...candidates.values()];
  const candidateMethods = new Map();
  for (const group of differences) for (const key of group.unmatched_network_keys) candidateMethods.set(key, group.method);
  const rowDiagnostics = [];
  for (const [side, table, index, partner, key] of [['network', network, left, right, networkKey], ['annotation', annotation, right, left, annotationKey]]) {
    const duplicateKinds = new Map(index.duplicates.map(group => [group.key, group.kind]));
    table.rows.forEach((row, position) => {
      const value = row[index.column], blank = !value.trim(), flags = [];
      if (blank) flags.push('blank_key');
      if (value !== value.trim()) flags.push('boundary_whitespace');
      if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\uFEFF]/u.test(value)) flags.push('invisible_or_control_character');
      if (duplicateKinds.has(value)) flags.push('duplicate_key', duplicateKinds.get(value));
      if (side === 'network' && candidateMethods.has(value)) flags.push('potential_' + candidateMethods.get(value));
      rowDiagnostics.push({ side, data_row: position + 1, key_column: key, key: value, status: blank ? 'blank_key' : partner.groups.has(value) ? 'exact_overlap' : side === 'network' ? 'network_without_annotation' : 'annotation_not_in_network', matching_row_count: blank ? 0 : partner.groups.get(value)?.data_rows.length ?? 0, flags });
    });
  }
  const networkUnique = left.groups.size, annotationUnique = right.groups.size;
  return {
    schema: MATCH_SCHEMA, version: MATCH_VERSION,
    comparison_policy: { keys: 'verbatim-decoded-strings', case_sensitive: true, trim_keys_for_matching: false, blank_keys: 'empty-or-whitespace-only', coverage_denominator: 'unique-nonblank-network-keys', data_rows: '1-based, header excluded; truly blank physical lines skipped', candidate_differences: 'diagnostic-only; no automatic replacement; no alias/species mapping' },
    selected_keys: { network: networkKey, annotation: annotationKey },
    summary: {
      network_rows: network.rows.length, annotation_rows: annotation.rows.length,
      network_unique_keys: networkUnique, annotation_unique_keys: annotationUnique,
      exact_overlap_keys: exact.length, one_to_one_overlap_keys: exact.filter(row => row.one_to_one).length,
      network_coverage: networkUnique ? exact.length / networkUnique : null,
      annotation_key_utilization: annotationUnique ? exact.length / annotationUnique : null,
      network_without_annotation_keys: missing.length, annotation_not_in_network_keys: unused.length,
      network_duplicate_keys: left.duplicates.length, annotation_duplicate_keys: right.duplicates.length,
      annotation_conflicting_duplicate_keys: right.duplicates.filter(row => row.kind === 'conflicting_attributes').length,
      network_blank_rows: left.blanks.length, annotation_blank_rows: right.blanks.length,
      network_boundary_whitespace_rows: left.whitespace.length, annotation_boundary_whitespace_rows: right.whitespace.length,
      network_invisible_character_rows: left.invisible.length, annotation_invisible_character_rows: right.invisible.length,
      unmatched_network_keys_with_text_candidate: possible.size,
      diagnostic_candidate_groups: differences.length,
      ambiguous_candidate_groups: differences.filter(group => group.ambiguous).length,
    },
    exact_matches: exact, network_without_annotation: missing, annotation_not_in_network: unused,
    duplicate_keys: { network: left.duplicates, annotation: right.duplicates },
    blank_keys: { network: left.blanks, annotation: right.blanks },
    boundary_whitespace: { network: left.whitespace, annotation: right.whitespace },
    invisible_characters: { network: left.invisible, annotation: right.invisible },
    potential_text_differences: differences, row_diagnostics: rowDiagnostics,
    limitations: ['Key overlap is not a native Cytoscape import guarantee; verify the actual chosen network and key-column types.', 'Duplicate keys can make a join one-to-many or ambiguous; the checker never deduplicates or merges attributes.', 'No biological identifier validation, aliases, species conversion, fuzzy matching, or data modification.', 'Diagnostics contain original identifiers. Keep reports private.'],
  };
}

export function matchDiagnosticsCsv(report) {
  const header = ['source_table', 'source_label', 'data_row', 'key_column', 'key', 'status', 'matching_row_count', 'issue_codes'];
  const rows = report.row_diagnostics.map(row => [row.side, report.sources?.[row.side]?.label ?? row.side, row.data_row, row.key_column, row.key, row.status, row.matching_row_count, row.flags.join(';')]);
  for (const row of [header, ...rows]) for (const cell of row) {
    assertSpreadsheetSafe(cell, 'Diagnostic CSV');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(String(cell))) throw new Error('Diagnostic CSV: a control or invisible formatting character cannot be exported safely.');
  }
  return serializeTableCsv({ header, rows });
}

async function digest(text) {
  if (!globalThis.crypto?.subtle) throw new Error('Open the loopback preview; SHA-256 is unavailable in this browser context.');
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createMatchReport(networkText, annotationText, { networkKey, annotationKey, networkFormat = 'auto', annotationFormat = 'auto', networkLabel = 'Network input', annotationLabel = 'Annotation input' } = {}) {
  for (const label of [networkLabel, annotationLabel]) if (typeof label !== 'string' || !label || label.length > 300) throw new Error('Input labels must be 1–300 characters.');
  const network = parseMatchTable(networkText, networkFormat), annotation = parseMatchTable(annotationText, annotationFormat);
  const report = compareMatchTables(network, annotation, { networkKey, annotationKey });
  const [networkHash, annotationHash] = await Promise.all([digest(networkText), digest(annotationText)]);
  report.checked_at = new Date().toISOString();
  report.sources = {
    network: { label: networkLabel, format: network.format, header: [...network.header], text_sha256: networkHash },
    annotation: { label: annotationLabel, format: annotation.format, header: [...annotation.header], text_sha256: annotationHash },
  };
  report.fingerprint_scope = 'Exact decoded UTF-8 input text and exact diagnostic CSV bytes; not original file bytes or an authorship signature. Raw input text is not included in this report.';
  report.diagnostics_csv_sha256 = null;
  report.csv_export_blocker = null;
  try { report.diagnostics_csv_sha256 = await digest(matchDiagnosticsCsv(report)); }
  catch (error) {
    if (!/formula-like|control or invisible/u.test(error.message)) throw error;
    report.csv_export_blocker = error.message + ' Download the JSON report instead; original text is never rewritten.';
  }
  return report;
}
