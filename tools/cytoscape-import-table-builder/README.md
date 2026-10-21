# Cytoscape Import Table Builder

An MIT-licensed, dependency-free browser utility with two tabs at one stable URL.
The existing import-table builder and workflow remain unchanged by this release.

## Build import tables

Convert a final annotation CSV with unique `Gene` keys into node attributes and a
module/color lookup for an existing network. Defaults and per-gene colour
overrides follow the existing evidence-mapping workflow. It does not infer
biological modules, create edges, control Cytoscape or validate biological meaning.
Saved palette configuration is not included in this public selection.

## Table Match Checker

Open [the check tab](index.html#table-match-checker). Try the synthetic pair or
choose/paste two UTF-8 CSV/TSV tables. Inspect both tables, **explicitly select a
key column on each side**, then compare and download diagnostics if needed.

Use an actual network **node table**, not an edge list or .cys session. A selected
node export checks only that subset; use all nodes intended for import. Export
Excel to UTF-8 CSV/TSV first. Choose the actual intended identifier columns,
such as network `shared name` and annotation `Gene`.

### Matching contract

- Exact matching compares original decoded strings, including case and boundary
  spaces. `001` differs from `1`, `A` from `a`, and ` A ` from `A`. Data are not
  trimmed, coerced, deduplicated, merged or rewritten. Headers are trimmed only
  for column selection; missing-value-looking keys such as `NA` remain text.
- **Exact network coverage = overlapping unique nonblank network keys / unique
  nonblank network keys.** Repeated rows do not inflate coverage. An empty
  denominator gives N/A, not 100%. Annotation utilization is separate.
- Diagnose identical/conflicting duplicate rows, blank keys, unmatched network
  keys, unused annotation keys and invisible characters. Exact overlap may be
  one-to-many or many-to-many; it is not necessarily a unique join.
- Space/case candidates are diagnostic only and never increase coverage. Both
  full key sets participate in collision checks, even keys already matched.
  No fuzzy matching, alias conversion, species mapping or biological identity
  validation is performed. Simple lowercase diagnostics are not full casefolding.
- Data-row references are 1-based parsed records, excluding the header and truly
  blank physical lines. Quoted multiline records occupy one data row; explicit
  empty fields remain visible. Views are paginated, not export-truncated.
- Changing inputs, files, delimiters or selected keys invalidates old reports.
  Pending/invalid file reads block comparison. Old asynchronous work cannot
  restore a result after the inputs have changed. Clearing the checker does not
  alter the original builder's input or previous downloads.

### Downloads

`cytoscape_table_match_report.json` contains input labels, selected columns,
decoded-text fingerprints, coverage definitions, complete grouped diagnostics,
row references, timestamp, CSV fingerprint or export blocker, and limitations.
It contains original identifiers, **not the full raw tables**; retain your source
files and keep reports private. This is not a reloadable session or an import file.

`cytoscape_table_match_rows.csv` has one row per parsed input record:

```text
source_table,source_label,data_row,key_column,key,status,matching_row_count,issue_codes
```

Formula-like or unsafe control/invisible CSV fields block CSV export without
rewriting identifiers. JSON remains available and preserves original text.
Fingerprints cover exact decoded text / exported CSV, not original-file bytes
or authenticated authorship. BOM decoding can change byte representation.

The version-1 JSON schema retains the original identifier
`sci-viz-toolkit/cytoscape-table-match` for compatibility. That label is not a
remote dependency: the public checker is self-contained. Its small `match-io.js`
contains only UTF-8 reading, a character limit, CSV safety and serialization;
no private palette or shared category-mapping implementation is imported.

### Limits and readiness

Per input: 25,000 data rows, 200 columns, 10 million decoded characters;
1,000 characters/key, 200/header, and a 40 MB pre-decode file guard.
No uploads, analytics, remote assets, browser persistence or automatic downloads.
Refresh loses inputs/results; explicitly retain local files and wanted exports.

Engineering checks use synthetic inputs. **Native Cytoscape import and real-project
review efficiency have not been tested.** This is an import-preflight diagnostic,
not biological validation or an import guarantee. In Cytoscape, check the actual
target network, both key columns and column types. See the
[Cytoscape table-import manual](https://manual.cytoscape.org/en/stable/Node_and_Edge_Column_Data.html).

## Local use

Serve this repository on loopback with
`python -m http.server 8000 --bind 127.0.0.1`, then open
`http://127.0.0.1:8000/tools/cytoscape-import-table-builder/`.
Use Node 24 and `npm test` for synthetic engineering checks. No npm package
installation or public deployment is required.
