import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseMatchTable, compareMatchTables, createMatchReport, matchDiagnosticsCsv, MATCH_SCHEMA, MATCH_LIMITS } from '../tools/cytoscape-import-table-builder/table-match-model.js';
import { serializeTableCsv } from '../tools/cytoscape-import-table-builder/match-io.js';
const parseTableCsv = input => { const { header, rows } = parseMatchTable(input, 'csv'); return { header, rows }; };
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const compare = (left, right, networkKey = 'Gene', annotationKey = 'Gene') => compareMatchTables(parseMatchTable(left), parseMatchTable(right), { networkKey, annotationKey });

test('match parser preserves raw cell spaces, leading zeros, quoted tabs/commas, BOM and multiline fields', () => {
  const csv = '\uFEFF Gene ,label\r\n" A ","comma, and ""quotes"""\r\n001,"two\nlines"\r\n';
  const parsed = parseMatchTable(csv);
  assert.deepEqual(parsed.header, ['Gene', 'label']);
  assert.deepEqual(parsed.rows, [[' A ', 'comma, and "quotes"'], ['001', 'two\nlines']]);
  assert.equal(parsed.format, 'csv');
  assert.deepEqual(parseMatchTable(serializeTableCsv(parsed)), parsed);
  const tsv = parseMatchTable('"shared name"\tlabel\r\n"gene\tkey"\t"alpha,beta"\r\n');
  assert.equal(tsv.format, 'tsv');
  assert.deepEqual(tsv.rows, [['gene\tkey', 'alpha,beta']]);
});

test('empty quoted keys and delimiter-defined empty rows are retained while empty physical lines are skipped', () => {
  assert.deepEqual(parseMatchTable('Gene\nA\n\n  \n""\nB\n').rows, [['A'], [''], ['B']]);
  assert.deepEqual(parseMatchTable('Gene,label\nA,x\n,\nB,y\n').rows, [['A', 'x'], ['', ''], ['B', 'y']]);
  assert.deepEqual(parseMatchTable('Gene\tlabel\nA\tx\n\t\n').rows, [['A', 'x'], ['', '']]);
});

test('matching is strictly case-sensitive, space-sensitive and string-based', () => {
  const report = compare('Gene\nGENE_A\ngene_b\n C \n001\n1\nNA\n', 'Gene\nGENE_A\nGENE_B\nC\n001\nNA\n');
  assert.equal(report.summary.network_unique_keys, 6);
  assert.equal(report.summary.exact_overlap_keys, 3);
  assert.equal(report.summary.network_coverage, .5);
  assert.deepEqual(report.exact_matches.map(row => row.key), ['GENE_A', '001', 'NA']);
  assert.deepEqual(report.network_without_annotation.map(row => row.key), ['gene_b', ' C ', '1']);
  assert.equal(report.summary.unmatched_network_keys_with_text_candidate, 2);
  assert.equal(report.comparison_policy.trim_keys_for_matching, false);
});

test('key columns on each side are explicit and can differ', () => {
  const network = parseMatchTable('SUID,shared name\n1,A\n2,B\n');
  const annotation = parseMatchTable('symbol,module\nB,M1\nA,M2\n');
  assert.throws(() => compareMatchTables(network, annotation), /choose a key column/);
  assert.throws(() => compareMatchTables(network, annotation, { networkKey: 'missing', annotationKey: 'symbol' }), /choose a key column/);
  const report = compareMatchTables(network, annotation, { networkKey: 'shared name', annotationKey: 'symbol' });
  assert.equal(report.summary.network_coverage, 1);
  assert.deepEqual(report.exact_matches[0].annotation_data_rows, [2]);
  assert.equal(report.selected_keys.annotation, 'symbol');
});

test('coverage uses unique nonblank network keys, not duplicated or blank rows', () => {
  const report = compare('Gene,label\nA,x\nA,x\nB,y\n,blank\n" ",space\n', 'Gene,label\nA,a\nA,b\nC,c\n,blank\n');
  assert.equal(report.summary.network_rows, 5);
  assert.equal(report.summary.network_unique_keys, 2);
  assert.equal(report.summary.network_coverage, .5);
  assert.equal(report.summary.annotation_key_utilization, .5);
  assert.equal(report.summary.one_to_one_overlap_keys, 0);
  assert.deepEqual(report.exact_matches[0].network_data_rows, [1, 2]);
  assert.deepEqual(report.exact_matches[0].annotation_data_rows, [1, 2]);
  assert.equal(report.summary.network_blank_rows, 2);
  assert.equal(report.summary.network_boundary_whitespace_rows, 1);
  assert.equal(report.summary.annotation_blank_rows, 1);
  assert.equal(report.row_diagnostics[0].matching_row_count, 2);
  assert.equal(report.row_diagnostics[3].status, 'blank_key');
});

test('all blank keys yield null coverage, never NaN or a misleading 100%', () => {
  const report = compare('Gene,label\n,blank\n" ",blank\n', 'Gene,label\n,blank\n');
  assert.equal(report.summary.network_unique_keys, 0);
  assert.equal(report.summary.annotation_unique_keys, 0);
  assert.equal(report.summary.network_coverage, null);
  assert.equal(report.summary.annotation_key_utilization, null);
  assert.equal(report.potential_text_differences.length, 0);
});

test('duplicate diagnostics separate repeated identical rows from conflicting non-key attributes', () => {
  const report = compare('Gene,label\nA,x\nA,x\nB,y\nB,z\n', 'Gene,module,colour\nA,M1,#123456\nA,M2,#123456\nB,M3,#654321\n');
  assert.deepEqual(report.duplicate_keys.network.map(row => [row.key, row.kind, row.differing_columns]), [['A', 'identical_rows', []], ['B', 'conflicting_attributes', ['label']]]);
  assert.deepEqual(report.duplicate_keys.annotation[0].differing_columns, ['module']);
  assert.equal(report.summary.annotation_conflicting_duplicate_keys, 1);
  assert.equal(report.summary.network_coverage, 1);
  assert.equal(report.summary.one_to_one_overlap_keys, 0);
});

test('boundary-space, case and combined candidates remain diagnostic and do not raise coverage', () => {
  const report = compare('Gene\n A \nB\n C \nNONE\n', 'Gene\nA\nb\nc\n');
  assert.equal(report.summary.network_coverage, 0);
  assert.equal(report.summary.network_without_annotation_keys, 4);
  assert.deepEqual(report.potential_text_differences.map(row => row.method), ['trim', 'case', 'trim_case']);
  assert.ok(report.potential_text_differences.every(row => row.diagnostic_only && !row.ambiguous));
  assert.equal(report.summary.network_boundary_whitespace_rows, 2);
});

test('collision detection includes already exact-matched keys and duplicate candidate rows', () => {
  const report = compare('Gene\nA\na\n B \n', 'Gene\nA\nB\nB\n');
  assert.equal(report.summary.exact_overlap_keys, 1);
  const caseGroup = report.potential_text_differences.find(row => row.method === 'case');
  assert.deepEqual(caseGroup.network_keys, ['A', 'a']);
  assert.deepEqual(caseGroup.unmatched_network_keys, ['a']);
  assert.equal(caseGroup.ambiguous, true);
  assert.equal(report.potential_text_differences.find(row => row.method === 'trim').ambiguous, true);
  assert.equal(report.summary.ambiguous_candidate_groups, 2);
});

test('multiple opposite-table text candidates are grouped once with their ambiguity visible', () => {
  const report = compare('Gene\n A\nA \n', 'Gene\nA\n A \n');
  assert.equal(report.potential_text_differences.length, 1);
  assert.deepEqual(report.potential_text_differences[0].network_keys, [' A', 'A ']);
  assert.deepEqual(report.potential_text_differences[0].annotation_keys, ['A', ' A ']);
  assert.equal(report.potential_text_differences[0].ambiguous, true);
  assert.equal(report.summary.unmatched_network_keys_with_text_candidate, 2);
});

test('invisible/control text is reported, not stripped or treated as a fuzzy match', () => {
  const report = compare('Gene,label\nA\u200b,x\n"B\nC",y\n', 'Gene\nA\nBC\n');
  assert.equal(report.summary.exact_overlap_keys, 0);
  assert.equal(report.summary.network_invisible_character_rows, 2);
  assert.equal(report.summary.unmatched_network_keys_with_text_candidate, 0);
  assert.deepEqual(report.invisible_characters.network[1], { data_row: 2, key: 'B\nC' });
});

test('Map-based identifiers do not collide with JavaScript object properties', () => {
  const report = compare('Gene\n__proto__\nconstructor\ntoString\n', 'Gene\nconstructor\n__proto__\n');
  assert.equal(report.summary.exact_overlap_keys, 2);
  assert.equal(report.summary.network_without_annotation_keys, 1);
});

test('row reordering leaves coverage and original table contents unchanged', () => {
  const left = parseMatchTable('Gene,attr\nA,x\nA,y\nB,z\n');
  const right = parseMatchTable('Gene,attr\nB,M2\nA,M1\n');
  const before = JSON.stringify([left, right]);
  const first = compareMatchTables(left, right, { networkKey: 'Gene', annotationKey: 'Gene' });
  assert.equal(JSON.stringify([left, right]), before);
  const second = compareMatchTables({ ...left, rows: [...left.rows].reverse() }, { ...right, rows: [...right.rows].reverse() }, { networkKey: 'Gene', annotationKey: 'Gene' });
  assert.deepEqual(first.summary, second.summary);
});

test('JSON report fingerprints exact decoded input and precise diagnostic CSV, not normalized data', async () => {
  const left = '\uFEFFname\n A \n001\n', right = 'Gene\nA\n001\n';
  const report = await createMatchReport(left, right, { networkKey: 'name', annotationKey: 'Gene', networkLabel: 'n.tsv', annotationLabel: 'a.csv' });
  assert.equal(report.schema, MATCH_SCHEMA);
  assert.equal(report.version, '1.0.0');
  assert.equal(report.sources.network.text_sha256, hash(left));
  assert.equal(report.sources.annotation.text_sha256, hash(right));
  assert.equal(report.diagnostics_csv_sha256, hash(matchDiagnosticsCsv(report)));
  assert.equal(report.csv_export_blocker, null);
  const csv = parseTableCsv(matchDiagnosticsCsv(report));
  assert.equal(csv.rows.length, 4);
  assert.equal(csv.rows[0][4], ' A ');
  assert.equal(csv.rows[1][4], '001');
  assert.equal(csv.rows[0][1], 'n.tsv');
  assert.ok(Number.isFinite(Date.parse(report.checked_at)));
  assert.equal(report.network_without_annotation[0].key, ' A ');
  assert.equal(JSON.stringify(report).includes('"raw_text"'), false);
});

test('formula-like diagnostic values block CSV only; JSON preserves their original text', async () => {
  for (const value of ['=1+1', '+COMMAND', '@evil', '-CMD', ' \t=evil']) {
    const table = serializeTableCsv({ header: ['Gene'], rows: [[value]] });
    const report = await createMatchReport(table, table, { networkKey: 'Gene', annotationKey: 'Gene' });
    assert.equal(report.summary.exact_overlap_keys, 1);
    assert.equal(report.exact_matches[0].key, value);
    assert.equal(report.diagnostics_csv_sha256, null);
    assert.match(report.csv_export_blocker, /JSON report/);
    assert.throws(() => matchDiagnosticsCsv(report), /formula-like/);
    assert.equal(JSON.parse(JSON.stringify(report)).exact_matches[0].key, value);
  }
});

test('unsafe source labels and selected headers also block diagnostic CSV without altering identifiers', async () => {
  const labelReport = await createMatchReport('Gene\nA\n', 'Gene\nA\n', { networkKey: 'Gene', annotationKey: 'Gene', networkLabel: '=bad.csv' });
  assert.match(labelReport.csv_export_blocker, /formula-like/);
  const headerReport = await createMatchReport('=Gene\nA\n', 'Gene\nA\n', { networkKey: '=Gene', annotationKey: 'Gene' });
  assert.match(headerReport.csv_export_blocker, /formula-like/);
});

test('invisible formatting and unsafe controls block CSV while JSON remains exact', async () => {
  for (const key of ['A\u200b', '\u0001=evil', 'A\u202e']) {
    const csv = serializeTableCsv({ header: ['Gene'], rows: [[key]] });
    const report = await createMatchReport(csv, csv, { networkKey: 'Gene', annotationKey: 'Gene' });
    assert.match(report.csv_export_blocker, /control or invisible/);
    assert.equal(report.diagnostics_csv_sha256, null);
    assert.equal(report.exact_matches[0].key, key);
  }
});

test('negative numeric text keys are kept as exact strings and do not become formulas', async () => {
  const report = await createMatchReport('Gene\n-12\n', 'Gene\n-12\n', { networkKey: 'Gene', annotationKey: 'Gene' });
  assert.equal(report.csv_export_blocker, null);
  assert.equal(report.exact_matches[0].key, '-12');
});

test('malformed, header-only, duplicate-header, wrong-width and invalid-format inputs are rejected', () => {
  for (const input of ['', 'Gene\n', 'Gene,Gene\nA,B\n', ',label\nA,x\n', 'Gene,label\nA\n', 'Gene\n"A"x\n', 'Gene\nA"B\n', 'Gene\n"A\n']) assert.throws(() => parseMatchTable(input));
  assert.throws(() => parseMatchTable('Gene\nA\n', 'invalid'));
  assert.throws(() => parseMatchTable('x'.repeat(10000001)), /10 million/);
  assert.throws(() => compareMatchTables({ header: ['Gene'], rows: [[1]] }, parseMatchTable('Gene\nA\n'), { networkKey: 'Gene', annotationKey: 'Gene' }), /non-text/);
});

test('table and key limits are enforced with declared, bounded candidate grouping', () => {
  assert.equal(MATCH_LIMITS.rows, 25000);
  assert.throws(() => parseMatchTable('Gene\n' + 'A\n'.repeat(25001)), /25,000/);
  const manyColumns = Array.from({ length: 201 }, (_, i) => 'c' + i);
  assert.throws(() => parseMatchTable(manyColumns.join(',') + '\n' + manyColumns.join(',') + '\n'), /200 columns/);
  assert.throws(() => compare('Gene\n' + 'A'.repeat(1001) + '\n', 'Gene\nA\n'), /1,000/);
  const network = 'Gene\n' + ' A\n'.repeat(25000), annotation = 'Gene\n' + 'A\n'.repeat(25000);
  const report = compare(network, annotation);
  assert.equal(report.potential_text_differences.length, 1);
  assert.equal(report.potential_text_differences[0].network_row_count, 25000);
  assert.equal(report.potential_text_differences[0].annotation_row_count, 25000);
  assert.equal(report.row_diagnostics.length, 50000);
  assert.equal(report.summary.exact_overlap_keys, 0);
});

test('checker is an Import Builder feature, with explicit keys and no new top-level tool card', async () => {
  const html = await readFile(new URL('../tools/cytoscape-import-table-builder/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="table-match-checker"/);
  assert.match(html, /src="table-match\.js"/);
  assert.match(html, /id="cytoscape-builder-panel"/);
  assert.match(html, /diagnostic only/);
  assert.match(html, /No fuzzy matching/);
  assert.match(html, /SHA-256/);
  const overview = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((overview.match(/class="toolkit-card"/g) ?? []).length, 3);
  for (const name of ['table-match.js', 'table-match-model.js']) {
    const script = await readFile(new URL('../tools/cytoscape-import-table-builder/' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|sendBeacon|\.innerHTML\s*=/);
  }
});
