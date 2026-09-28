// Browser-only adapter for step 05 of the Functional Module Evidence Mapping workflow.
// No network requests, storage, or biological re-classification are performed here.
const OPTIONAL_COLUMNS = [
  'Selected_terms', 'Term_count', 'Functional_modules_raw', 'Functional_module_count',
  'Functional_subtheme', 'Bridge_annotation', 'Evidence_basis', 'Curation_confidence',
  'Curation_reason', 'Manual_curation_applied', 'Core_gene',
];
const MAX_CHARACTERS = 10000000;
const MAX_ROWS = 50000;
const MAX_COLUMNS = 200;
const NODE_COLUMNS = [
  'Gene', 'Primary_module_final', 'Module_name_final', 'Primary_fill_color_hex',
  'Label_all_center', 'Show_label', 'Node_size_main_px', 'Label_font_size_px',
  'Border_width_px',
];
const COLOR_COLUMNS = ['Primary_module_final', 'Module_name_final', 'Primary_fill_color_hex'];
const yesLike = value => ['yes', 'y', 'true', '1'].includes(String(value).trim().toLowerCase());
const textOrDefault = (value, fallback) => String(value ?? '').trim() || fallback;

export function parseCsv(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Paste or choose a CSV file first.');
  if (input.length > MAX_CHARACTERS) throw new Error('Keep the CSV under 10 million characters.');
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  let atStart = true;
  let line = 1;
  let rowHasCsvSyntax = false;

  const finishCell = () => {
    row.push(cell);
    cell = '';
    atStart = true;
    afterQuote = false;
    if (row.length > MAX_COLUMNS) throw new Error(`Line ${line}: use no more than ${MAX_COLUMNS} columns.`);
  };
  const finishRow = () => {
    finishCell();
    // Ignore blank physical lines, but retain explicit empty fields for validation.
    if (rowHasCsvSyntax || row.some(value => value.trim())) rows.push(row);
    row = [];
    rowHasCsvSyntax = false;
    if (rows.length > MAX_ROWS + 1) throw new Error(`Use no more than ${MAX_ROWS} data rows.`);
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index++;
        } else quoted = false, afterQuote = true;
      } else {
        cell += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (afterQuote && ![',', '\r', '\n'].includes(char)) {
      throw new Error(`Line ${line}: unexpected text after a closing quote.`);
    }
    if (char === ',') {
      rowHasCsvSyntax = true;
      finishCell();
    } else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && source[index + 1] === '\n') index++;
      line++;
    } else if (char === '"' && atStart) {
      rowHasCsvSyntax = true;
      quoted = true;
      atStart = false;
    } else if (char === '"') {
      throw new Error(`Line ${line}: quotes inside a field must be doubled.`);
    } else {
      cell += char;
      atStart = false;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field.');
  if (cell || row.length || afterQuote) finishRow();
  if (rows.length < 2) throw new Error('The CSV needs a header and at least one gene row.');
  const header = rows.shift().map(value => value.trim());
  if (header.some(value => !value)) throw new Error('CSV headers cannot be empty.');
  if (new Set(header).size !== header.length) throw new Error('CSV headers must be unique.');
  if (!header.includes('Gene')) throw new Error('The final annotation CSV must contain a Gene column.');
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].length !== header.length) {
      throw new Error(`Data row ${index + 1} has ${rows[index].length} columns; expected ${header.length}.`);
    }
  }
  return { header, rows };
}

export function buildImportTables(csv) {
  const { header, rows } = typeof csv === 'string' ? parseCsv(csv) : csv;
  if (!Array.isArray(header) || !Array.isArray(rows) || !header.includes('Gene') || !rows.length) {
    throw new Error('Provide a valid final annotation CSV.');
  }
  const column = name => header.indexOf(name);
  const value = (row, name) => column(name) < 0 ? '' : row[column(name)] ?? '';
  const optional = OPTIONAL_COLUMNS.filter(name => header.includes(name));
  const nodeHeader = [...NODE_COLUMNS, ...optional];
  const nodes = [];
  const colors = [];
  const seenGenes = new Set();
  const seenColors = new Set();
  let defaultedModule = 0;
  let defaultedColor = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length !== header.length) throw new Error(`Data row ${index + 1} has the wrong number of columns.`);
    for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
      // CSV quoting alone does not neutralize formulas when a file is opened in a spreadsheet.
      if (/^[\s]*[=+@]/u.test(row[cellIndex]) || /^[\s]*-(?!\d+(?:\.\d+)?\s*$)/u.test(row[cellIndex])) {
        throw new Error(`Data row ${index + 1}, ${header[cellIndex]}: a formula-like value cannot be exported safely.`);
      }
    }
    const gene = textOrDefault(value(row, 'Gene'), '');
    if (!gene) throw new Error(`Data row ${index + 1}: Gene is empty.`);
    if (seenGenes.has(gene)) throw new Error(`Data row ${index + 1}: duplicate Gene “${gene}”.`);
    seenGenes.add(gene);
    const moduleInput = String(value(row, 'Primary_module_final')).trim();
    const colorInput = String(value(row, 'Primary_fill_color_hex')).trim();
    const module = moduleInput || 'Unclassified';
    const name = textOrDefault(value(row, 'Module_name_final'), module);
    const color = colorInput || '#BDBDBD';
    const core = yesLike(value(row, 'Core_gene'));
    const show = yesLike(value(row, 'Show_label'));
    if (!moduleInput) defaultedModule++;
    if (!colorInput) defaultedColor++;
    nodes.push([
      gene, module, name, color, gene,
      textOrDefault(value(row, 'Show_label'), 'no'),
      core ? '56' : '42', show ? '12' : '10', core ? '2.0' : '0.8',
      ...optional.map(key => value(row, key)),
    ]);
    const colorRow = [module, name, color];
    const key = JSON.stringify(colorRow);
    if (!seenColors.has(key)) {
      seenColors.add(key);
      colors.push(colorRow);
    }
  }
  colors.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return {
    nodeTable: { header: nodeHeader, rows: nodes },
    colorTable: { header: COLOR_COLUMNS, rows: colors },
    stats: { genes: nodes.length, colors: colors.length, defaultedModule, defaultedColor },
  };
}

export function serializeCsv(table) {
  const encode = value => {
    const text = String(value ?? '');
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [table.header, ...table.rows].map(row => row.map(encode).join(',')).join('\n') + '\n';
}

if (typeof document !== 'undefined') {
  const input = document.getElementById('cytoscape-input');
  const file = document.getElementById('cytoscape-file');
  const previewButton = document.getElementById('cytoscape-preview-button');
  const nodeButton = document.getElementById('cytoscape-node-download');
  const colorButton = document.getElementById('cytoscape-color-download');
  const status = document.getElementById('cytoscape-status');
  const summary = document.getElementById('cytoscape-summary');
  const table = document.getElementById('cytoscape-preview');
  const colorTable = document.getElementById('cytoscape-color-preview');
  const colorHeading = document.getElementById('cytoscape-colors-heading');
  let result = null;

  function invalidate() {
    result = null;
    nodeButton.disabled = true;
    colorButton.disabled = true;
    summary.hidden = true;
    table.hidden = true;
    table.replaceChildren();
    colorTable.hidden = true;
    colorTable.replaceChildren();
    colorHeading.hidden = true;
  }
  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function renderTable(target, data, limit) {
    const head = document.createElement('thead');
    const body = document.createElement('tbody');
    const headerRow = document.createElement('tr');
    for (const value of data.header) {
      const th = document.createElement('th');
      th.textContent = value;
      headerRow.append(th);
    }
    head.append(headerRow);
    for (const row of data.rows.slice(0, limit)) {
      const tr = document.createElement('tr');
      for (const value of row) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      body.append(tr);
    }
    target.replaceChildren(head, body);
    target.hidden = false;
  }
  function download(tableData, filename) {
    const blob = new Blob([serializeCsv(tableData)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setStatus(`Prepared ${filename} for download. Check your browser's downloads.`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  input.addEventListener('input', () => {
    invalidate();
    setStatus('Input changed. Preview again before downloading.');
  });
  file.addEventListener('change', async () => {
    invalidate();
    const selected = file.files?.[0];
    if (!selected) return;
    if (selected.size > MAX_CHARACTERS * 4) {
      setStatus('Choose a CSV smaller than 40 MB.', true);
      return;
    }
    try {
      input.value = await selected.text();
      setStatus(`Loaded ${selected.name} locally. Preview the table to validate it.`);
    } catch {
      setStatus('This file could not be read in your browser.', true);
    }
  });
  previewButton.addEventListener('click', () => {
    invalidate();
    try {
      result = buildImportTables(input.value);
      renderTable(table, result.nodeTable, 6);
      renderTable(colorTable, result.colorTable, 12);
      colorHeading.hidden = false;
      const { genes, colors, defaultedModule, defaultedColor } = result.stats;
      summary.textContent = `${genes} gene${genes === 1 ? '' : 's'} · ${colors} module/color combination${colors === 1 ? '' : 's'} · ${result.nodeTable.header.length} node columns`;
      summary.hidden = false;
      nodeButton.disabled = false;
      colorButton.disabled = false;
      const defaults = defaultedModule || defaultedColor
        ? ` Defaults used: ${defaultedModule} unclassified module${defaultedModule === 1 ? '' : 's'}, ${defaultedColor} gray color${defaultedColor === 1 ? '' : 's'}.`
        : '';
      setStatus(`Import tables are ready. Preview shows up to 6 node rows and 12 color combinations.${defaults}`);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  nodeButton.addEventListener('click', () => {
    if (result) download(result.nodeTable, 'cytoscape_node_import.csv');
  });
  colorButton.addEventListener('click', () => {
    if (result) download(result.colorTable, 'cytoscape_module_color_annotation_import.csv');
  });
}
