import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildImportTables, parseCsv, serializeCsv } from '../tools/cytoscape-import-table-builder/tool.js';

const synthetic = '\uFEFFGene,Primary_module_final,Module_name_final,Primary_fill_color_hex,Core_gene,Show_label,Selected_terms\n' +
  'GENE_A,Immune response,,#7B8FB8,yes,YES,"term alpha, term ""beta"""\r\n' +
  'GENE_B,Immune response,,#7B8FB8,no,no,"two\nlines"\r\n' +
  'GENE_C,Immune response,Override,#123456,1,1,\r\n' +
  'GENE_D,,,,,,\r\n';

test('CSV parser handles BOM, CRLF, quoted commas, escaped quotes and multiline values', () => {
  const parsed = parseCsv(synthetic);
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.rows[0][6], 'term alpha, term "beta"');
  assert.equal(parsed.rows[1][6], 'two\nlines');
  assert.deepEqual(parseCsv(serializeCsv(parsed)), parsed);
});

test('builder matches workflow defaults, optional column order and per-node overrides', () => {
  const result = buildImportTables(synthetic);
  assert.deepEqual(result.nodeTable.header, [
    'Gene', 'Primary_module_final', 'Module_name_final', 'Primary_fill_color_hex',
    'Label_all_center', 'Show_label', 'Node_size_main_px', 'Label_font_size_px',
    'Border_width_px', 'Selected_terms', 'Core_gene',
  ]);
  assert.deepEqual(result.nodeTable.rows[0], [
    'GENE_A', 'Immune response', 'Immune response', '#7B8FB8', 'GENE_A', 'YES',
    '56', '12', '2.0', 'term alpha, term "beta"', 'yes',
  ]);
  assert.deepEqual(result.nodeTable.rows[1].slice(5, 9), ['no', '42', '10', '0.8']);
  assert.deepEqual(result.nodeTable.rows[2].slice(1, 9), [
    'Immune response', 'Override', '#123456', 'GENE_C', '1', '56', '12', '2.0',
  ]);
  assert.deepEqual(result.nodeTable.rows[3].slice(0, 9), [
    'GENE_D', 'Unclassified', 'Unclassified', '#BDBDBD', 'GENE_D', 'no', '42', '10', '0.8',
  ]);
  assert.deepEqual(result.colorTable.rows, [
    ['Immune response', 'Immune response', '#7B8FB8'],
    ['Immune response', 'Override', '#123456'],
    ['Unclassified', 'Unclassified', '#BDBDBD'],
  ]);
  assert.deepEqual(result.stats, { genes: 4, colors: 3, defaultedModule: 1, defaultedColor: 1 });
  assert.deepEqual(parseCsv(serializeCsv(result.nodeTable)), result.nodeTable);
  assert.equal(serializeCsv(result.colorTable), 'Primary_module_final,Module_name_final,Primary_fill_color_hex\n' +
    'Immune response,Immune response,#7B8FB8\n' +
    'Immune response,Override,#123456\n' +
    'Unclassified,Unclassified,#BDBDBD\n');
});

test('builder rejects missing or duplicate genes, malformed CSV and formula-like cells', () => {
  for (const input of [
    'Other\nA\n',
    'Gene\nA\nA\n',
    'Gene\n \n',
    'Gene,Core_gene\nA\n',
    'Gene,Core_gene\n"A"x,yes\n',
    'Gene,Selected_terms\nA,=HYPERLINK("bad")\n',
    'Gene,Core_gene\nA,no\n,\nB,no\n',
    'Gene\nA\n""\n',
  ]) assert.throws(() => buildImportTables(input));
});

test('CSV parser ignores truly blank physical lines', () => {
  assert.deepEqual(parseCsv('Gene\nA\n\n  \nB\n').rows, [['A'], ['B']]);
});

test('standalone tool page documents local-only processing and workflow connection', async () => {
  const page = await readFile(new URL('../tools/cytoscape-import-table-builder/index.html', import.meta.url), 'utf8');
  assert.match(page, /Your CSV stays in this browser/);
  assert.match(page, /does not infer modules/);
  assert.match(page, /src="tool\.js"/);
  assert.match(page, /research-tools-public\/tree\/main\/cytoscape\/workflows\/functional-module-evidence-mapping/);
});
