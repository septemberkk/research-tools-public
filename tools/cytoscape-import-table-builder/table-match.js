import { readUtf8File } from './match-io.js';
import { parseMatchTable, createMatchReport, matchDiagnosticsCsv } from './table-match-model.js';

const DEMO_NETWORK = 'shared name\tnode_type\nGENE_A\tsynthetic\nGENE_B\tsynthetic\nGENE_C\tsynthetic\nGENE_D\tsynthetic\nGENE_E \tsynthetic\nGENE_F\tsynthetic\nGENE_G\tsynthetic\nGENE_G\tsynthetic\n\tsynthetic\n';
const DEMO_ANNOTATION = 'Gene,Module\nGENE_A,Example module 1\nGENE_A,Conflicting example module\nGENE_B,Example module 1\ngene_c,Example module 2\nGENE_E,Example module 2\n gene_f ,Example module 3\nGENE_G,Example module 3\nGENE_X,Outside-network example\n,Missing-key example\n';
const KEY_DISPLAY = value => JSON.stringify(value).replace(/[\u00a0\u200b-\u200f\u202a-\u202e\u2060-\u206f\uFEFF]/gu, char => '\\u' + char.codePointAt(0).toString(16).padStart(4, '0'));
const shortRows = values => values.slice(0, 6).join(', ') + (values.length > 6 ? ` … (${values.length} rows)` : '');
const shortKeys = values => values.slice(0, 4).map(KEY_DISPLAY).join(', ') + (values.length > 4 ? ` … (${values.length} keys)` : '');
const PAGE_SIZE = 50;

if (typeof document !== 'undefined') {
  const find = id => document.getElementById(id);
  const tabs = [find('cytoscape-builder-tab'), find('match-checker-tab')];
  const panels = [find('cytoscape-builder-panel'), find('table-match-checker')];
  function showTab(index, focus = false, updateHash = true) {
    tabs.forEach((tab, position) => { tab.setAttribute('aria-selected', String(position === index)); tab.tabIndex = position === index ? 0 : -1; panels[position].hidden = position !== index; });
    if (focus) tabs[index].focus();
    if (updateHash) history.replaceState(null, '', location.pathname + location.search + (index ? '#table-match-checker' : '#cytoscape-builder-panel'));
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showTab(index));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') target = 1 - index;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = 1;
      if (target !== undefined) { event.preventDefault(); showTab(target, true); }
    });
  });
  const selectHashTab = () => showTab(location.hash === '#table-match-checker' ? 1 : 0, false, false);
  selectHashTab();
  window.addEventListener('hashchange', () => { if (['#table-match-checker', '#cytoscape-builder-panel'].includes(location.hash)) selectHashTab(); });

  const fields = Object.fromEntries(['network', 'annotation'].map(side => [side, {
    text: find(`match-${side}-text`), file: find(`match-${side}-file`), format: find(`match-${side}-format`), key: find(`match-${side}-key`), meta: find(`match-${side}-meta`),
    readToken: 0, readError: null, label: side === 'network' ? 'Network input' : 'Annotation input', table: null,
  }]));
  const compareButton = find('match-compare'), jsonButton = find('match-json-download'), csvButton = find('match-csv-download');
  const resultPanel = find('match-results'), status = find('match-status');
  let revision = 0, result = null, page = 0;
  function setStatus(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
  function clearResult() {
    revision++; result = null; page = 0; jsonButton.disabled = true; csvButton.disabled = true;
    resultPanel.hidden = true; find('match-detail-table').replaceChildren();
  }
  function invalidateTables() {
    clearResult();
    compareButton.disabled = true;
    for (const entry of Object.values(fields)) {
      entry.table = null; entry.key.replaceChildren(new Option('Inspect both tables first', '')); entry.key.disabled = true;
      entry.meta.textContent = 'Input changed. Inspect both tables again.';
    }
  }
  function updateKeyPreview() {
    for (const entry of Object.values(fields)) {
      if (!entry.table) continue;
      const column = entry.table.header.indexOf(entry.key.value);
      entry.meta.textContent = `${entry.table.rows.length} data rows · ${entry.table.format.toUpperCase()} · ${entry.table.header.length} columns` + (column < 0 ? '. Choose the intended key column.' : `. Key samples: ${entry.table.rows.slice(0, 3).map(row => KEY_DISPLAY(row[column])).join(', ')}`);
    }
    compareButton.disabled = Object.values(fields).some(entry => !entry.table || !entry.key.value || entry.readError);
  }
  function inspect() {
    invalidateTables();
    try {
      const parsed = {};
      for (const [side, entry] of Object.entries(fields)) {
        if (entry.readError) throw new Error(entry.readError);
        try { parsed[side] = parseMatchTable(entry.text.value, entry.format.value); }
        catch (error) { throw new Error((side === 'network' ? 'Network' : 'Annotation') + ': ' + error.message); }
      }
      for (const [side, entry] of Object.entries(fields)) {
        entry.table = parsed[side];
        entry.key.replaceChildren(new Option('Choose key column…', ''), ...entry.table.header.map(value => new Option(value, value)));
        entry.key.disabled = false;
      }
      updateKeyPreview();
      setStatus('Tables inspected. Explicitly choose both key columns; no column is selected automatically.');
      return true;
    } catch (error) { setStatus(error.message, true); return false; }
  }
  for (const [side, entry] of Object.entries(fields)) {
    entry.text.addEventListener('input', () => {
      entry.readToken++; entry.readError = null; entry.label = (side === 'network' ? 'Network' : 'Annotation') + ' edited/pasted input';
      entry.file.value = ''; invalidateTables(); setStatus('Input changed. Inspect both tables and choose keys again before comparing or downloading.');
    });
    entry.format.addEventListener('change', () => { invalidateTables(); setStatus('Delimiter changed. Inspect both tables again.'); });
    entry.key.addEventListener('change', () => { clearResult(); updateKeyPreview(); setStatus('Key selection changed. Compare again before downloading.'); });
    entry.file.addEventListener('change', async () => {
      invalidateTables();
      const token = ++entry.readToken, selected = entry.file.files?.[0];
      if (!selected) { entry.readError = null; setStatus('File selection cleared. Inspect the current pasted inputs before continuing.'); return; }
      entry.readError = 'Wait for the ' + side + ' file to finish loading.';
      setStatus('Reading ' + side + ' table locally…');
      try {
        const text = await readUtf8File(selected);
        if (token !== entry.readToken) return;
        entry.text.value = text; entry.label = selected.name; entry.readError = null;
        setStatus(`Loaded ${selected.name} locally. Inspect both tables before choosing keys.`);
      } catch (error) { if (token === entry.readToken) { entry.readError = side + ': ' + error.message; setStatus(entry.readError, true); } }
    });
  }
  find('match-inspect').addEventListener('click', inspect);

  function metrics(report) {
    const summary = report.summary;
    const values = [
      ['Exact network coverage', summary.network_coverage === null ? 'N/A' : (summary.network_coverage * 100).toFixed(1) + '%'],
      ['Overlapping unique keys', `${summary.exact_overlap_keys} / ${summary.network_unique_keys}`],
      ['One-to-one overlapping keys', summary.one_to_one_overlap_keys],
      ['Unused annotation keys', summary.annotation_not_in_network_keys],
      ['Network keys without annotation', summary.network_without_annotation_keys],
      ['Duplicate keys · network / annotation', `${summary.network_duplicate_keys} / ${summary.annotation_duplicate_keys}`],
      ['Blank rows · network / annotation', `${summary.network_blank_rows} / ${summary.annotation_blank_rows}`],
      ['Possible text differences · unmatched keys', summary.unmatched_network_keys_with_text_candidate],
    ];
    find('match-stats').replaceChildren(...values.map(([label, value]) => {
      const box = document.createElement('div'), title = document.createElement('dt'), number = document.createElement('dd');
      title.textContent = label; number.textContent = String(value); box.append(title, number); return box;
    }));
    const messages = [];
    if (summary.network_duplicate_keys || summary.annotation_duplicate_keys) messages.push('Duplicate keys are present; overlap does not mean a one-to-one join.');
    if (summary.annotation_conflicting_duplicate_keys) messages.push(`${summary.annotation_conflicting_duplicate_keys} annotation duplicate keys have conflicting attributes.`);
    if (summary.network_blank_rows || summary.annotation_blank_rows) messages.push('Blank keys are excluded from the unique-key denominators and reported separately.');
    if (summary.ambiguous_candidate_groups) messages.push(`${summary.ambiguous_candidate_groups} text-difference groups have collisions or duplicate rows; do not replace them automatically.`);
    if (summary.network_boundary_whitespace_rows || summary.annotation_boundary_whitespace_rows || summary.network_invisible_character_rows || summary.annotation_invisible_character_rows) messages.push('Whitespace or invisible-character issues are present.');
    messages.push('Verify the actual Cytoscape network, selected key columns, and column types. No identifiers or attributes have been changed.');
    find('match-quality').textContent = messages.join(' ');
    find('match-csv-warning').textContent = report.csv_export_blocker ?? '';
    find('match-csv-warning').hidden = !report.csv_export_blocker;
  }
  function viewData() {
    switch (find('match-view').value) {
      case 'network_missing': return { header: ['Network key · original text', 'Network data rows'], rows: result.network_without_annotation.map(row => [KEY_DISPLAY(row.key), shortRows(row.data_rows)]) };
      case 'annotation_unused': return { header: ['Annotation key · original text', 'Annotation data rows'], rows: result.annotation_not_in_network.map(row => [KEY_DISPLAY(row.key), shortRows(row.data_rows)]) };
      case 'exact': return { header: ['Exact key · original text', 'Network data rows', 'Annotation data rows', 'One-to-one'], rows: result.exact_matches.map(row => [KEY_DISPLAY(row.key), shortRows(row.network_data_rows), shortRows(row.annotation_data_rows), row.one_to_one ? 'Yes' : 'No · duplicate rows']) };
      case 'duplicates': return { header: ['Table', 'Duplicate key', 'Data rows', 'Duplicate kind', 'Differing attribute columns'], rows: Object.entries(result.duplicate_keys).flatMap(([side, groups]) => groups.map(row => [side, KEY_DISPLAY(row.key), shortRows(row.data_rows), row.kind.replaceAll('_', ' '), shortKeys(row.differing_columns)])) };
      case 'blanks': case 'whitespace': case 'invisible': {
        const collection = { blanks: 'blank_keys', whitespace: 'boundary_whitespace', invisible: 'invisible_characters' }[find('match-view').value];
        return { header: ['Table', 'Data row', 'Original key text'], rows: Object.entries(result[collection]).flatMap(([side, rows]) => rows.map(row => [side, row.data_row, KEY_DISPLAY(row.key)])) };
      }
      case 'differences': return { header: ['Diagnostic transform only', 'Network keys · includes collisions', 'Annotation keys · includes collisions', 'Ambiguous?', 'Rows · network / annotation'], rows: result.potential_text_differences.map(row => [row.method === 'trim' ? 'Boundary whitespace' : row.method === 'case' ? 'Case only' : 'Boundary whitespace + case', shortKeys(row.network_keys), shortKeys(row.annotation_keys), row.ambiguous ? 'Yes · manual review' : 'No collision detected · still not a match', `${row.network_row_count} / ${row.annotation_row_count}`]) };
      default: return { header: ['Table', 'Data row', 'Original key', 'Status', 'Matching row count', 'Issue codes'], rows: result.row_diagnostics.map(row => [row.side, row.data_row, KEY_DISPLAY(row.key), row.status, row.matching_row_count, row.flags.join('; ')]) };
    }
  }
  function renderView() {
    if (!result) return;
    const data = viewData(), totalPages = Math.max(1, Math.ceil(data.rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages - 1);
    const head = document.createElement('thead'), body = document.createElement('tbody'), title = document.createElement('tr');
    for (const label of data.header) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; title.append(cell); }
    head.append(title);
    for (const row of data.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const line = document.createElement('tr');
      for (const value of row) { const cell = document.createElement('td'); cell.textContent = String(value); line.append(cell); }
      body.append(line);
    }
    if (!data.rows.length) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = data.header.length; cell.textContent = 'No records in this view.'; row.append(cell); body.append(row); }
    find('match-detail-table').replaceChildren(head, body);
    find('match-view-count').textContent = `${data.rows.length} records · up to ${PAGE_SIZE} per page`;
    find('match-page-label').textContent = `Page ${page + 1} / ${totalPages}`;
    find('match-previous').disabled = page === 0;
    find('match-next').disabled = page + 1 >= totalPages;
  }
  async function compare() {
    clearResult(); updateKeyPreview();
    const current = revision;
    try {
      if (Object.values(fields).some(entry => !entry.table || !entry.key.value || entry.readError)) throw new Error('Inspect both tables and explicitly select both keys before comparing.');
      compareButton.disabled = true; setStatus('Comparing locally and fingerprinting the exact input text…');
      const report = await createMatchReport(fields.network.text.value, fields.annotation.text.value, {
        networkKey: fields.network.key.value, annotationKey: fields.annotation.key.value,
        networkFormat: fields.network.format.value, annotationFormat: fields.annotation.format.value,
        networkLabel: fields.network.label, annotationLabel: fields.annotation.label,
      });
      if (current !== revision) return;
      result = report; metrics(report); resultPanel.hidden = false;
      find('match-view').value = 'network_missing'; renderView();
      jsonButton.disabled = false; csvButton.disabled = Boolean(report.csv_export_blocker);
      setStatus(`Comparison complete: ${report.summary.exact_overlap_keys} / ${report.summary.network_unique_keys} unique nonblank network keys overlap exactly. Reports are diagnostics, not cleaned or joined tables.`);
    } catch (error) { if (current === revision) setStatus(error.message, true); }
    finally { if (current === revision) updateKeyPreview(); }
  }
  compareButton.addEventListener('click', compare);
  find('match-demo').addEventListener('click', async () => {
    for (const entry of Object.values(fields)) { entry.readToken++; entry.readError = null; entry.file.value = ''; entry.format.value = 'auto'; }
    fields.network.text.value = DEMO_NETWORK; fields.network.label = 'synthetic_network.tsv';
    fields.annotation.text.value = DEMO_ANNOTATION; fields.annotation.label = 'synthetic_annotation.csv';
    if (!inspect()) return;
    fields.network.key.value = 'shared name'; fields.annotation.key.value = 'Gene'; updateKeyPreview();
    await compare();
  });
  find('match-reset').addEventListener('click', () => {
    for (const [side, entry] of Object.entries(fields)) { entry.readToken++; entry.readError = null; entry.text.value = ''; entry.file.value = ''; entry.format.value = 'auto'; entry.label = side === 'network' ? 'Network input' : 'Annotation input'; }
    invalidateTables(); setStatus('Checker cleared. Existing Import Builder input and downloaded files are unchanged.');
  });
  find('match-view').addEventListener('change', () => { page = 0; renderView(); });
  find('match-previous').addEventListener('click', () => { if (result && page > 0) { page--; renderView(); } });
  find('match-next').addEventListener('click', () => { if (result && !find('match-next').disabled) { page++; renderView(); } });
  function download(text, filename, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus(`Prepared ${filename}. This diagnostic report contains input identifiers; keep it private.`);
  }
  jsonButton.addEventListener('click', () => { if (result) download(JSON.stringify(result, null, 2) + '\n', 'cytoscape_table_match_report.json', 'application/json;charset=utf-8'); });
  csvButton.addEventListener('click', () => { if (result && !result.csv_export_blocker) download(matchDiagnosticsCsv(result), 'cytoscape_table_match_rows.csv', 'text/csv;charset=utf-8'); });
}
