# API

Version 0.1.0. Mapping schema version 1. Interfaces are named JavaScript ES-module
exports. Runtime functions return values or text; they do not write files,
download data, contact external services or persist browser state.

## Mapping contract

```json
{
  "schema": "research-tools/category-colors",
  "schema_version": 1,
  "mapping_name": "synthetic-demo-groups",
  "mapping": [
    {"category": "Group_A", "color_hex": "#234567"},
    {"category": "Group_B", "color_hex": "#89ABCD"}
  ]
}
```

A mapping contains 1–100 unique text keys. Boundary ASCII space, tab, CR and LF
are trimmed. Keys are nonempty, at most 60 UTF-16 code units, and contain no
control characters or line separators. Keys beginning with `=`, `+`, `-` or
`@` are rejected. Case, non-ASCII whitespace and Unicode normalization remain
significant. Three- and six-digit HEX values normalize to uppercase six-digit
HEX. Shared colours and case-only key differences produce warnings, not merging.

Mapping names are descriptive, single-line labels of at most 100 UTF-16 code
units. They are not category identities or part of the mapping fingerprint.
Cross-language text is limited to well-formed Unicode; arbitrary unpaired UTF-16
surrogates are outside that portability contract.

## Mapping exports

From `category-color-mapping.js`:

| Export | Contract |
| --- | --- |
| `MIN_CATEGORIES`, `MAX_CATEGORIES`, `MAPPING_SCHEMA` | Limits 1 and 100; schema identifier `research-tools/category-colors`. |
| `normalizeCategoryKey(value)` | Low-level string conversion and ASCII boundary trimming; not full validation. |
| `normalizeHex(value)` | Normalized HEX or an error; colour names are not parsed. |
| `validateMapping(rows)` | New normalized records or an error for invalid, duplicate or excessive keys. |
| `mappingWarnings(rows)` | Warning strings for shared colours and case-only key differences. |
| `mappingConfig(rows, name?)` | Version-1 master object; default name `category-colours`. |
| `parseMapping(text)` | Clean master plus `source_format` and `duplicate_rows_collapsed`. |
| `buildMappingExports(rows, name?)` | Six text-export records described below. |
| `applyMappingToTable(input, rows, options)` | New table and operation report, or an error. |
| `mappingCanonicalText(rows)` | Normalized mapping JSON sorted by case-sensitive key order; name and editor order are excluded. |
| `await sha256(text)` | SHA-256 of UTF-8 text, or `null` when Web Crypto is unavailable. |

Mapping validation errors may include zero-based `rowIndex` and `field`.
Human-readable error messages are diagnostics, not stable error codes.

## Imports and table application

JSON accepts the current schema and legacy unversioned
`{mapping_name,mapping}` or `{palette_name,mapping}` objects. Unknown schema/version
combinations and a version without its schema identifier are rejected.

CSV accepts exactly one of these case-sensitive column pairs:

- `category,color_hex`
- `Primary_module_final,Primary_fill_color_hex`

Extra columns are ignored during mapping extraction. Identical repeated key/colour
pairs collapse with a count; conflicting colours block import. Display names and
other annotations do not become part of the colour master. JSON retains the
mapping name; CSV reloads with `imported-colours`.

`applyMappingToTable` accepts CSV text or a `{header,rows}` table of string cells
with consistent row widths. Options are:

| Option | Meaning |
| --- | --- |
| `categoryColumn` | Required, exact source header. |
| `colorColumn` | Separate output column, default `color_hex`; appended if absent. |
| `replaceConflicts` | Boolean, default `false`; replacement requires explicit `true`. |
| `emptyCategory` | Optional explicit known fallback key, default `null`. |

Unknown nonempty categories never receive implicit defaults. Different or invalid
existing colours block output unless replacement is explicit. Equivalent HEX
values are normalized. No partial result is returned after a failure.

Input objects, row order, existing column order and non-colour cell values remain
unchanged. CSV quoting, line endings, BOMs and normalized headers are not
byte-preserved. All source cells receive the high-level spreadsheet-safety check.

The result is `{table,report}`. Report fields are `matching_policy`,
`conflict_policy`, `category_column`, `color_column`, `matched_rows`,
`filled_colors`, `unchanged_colors`, `replaced_colors`, `unused_categories` and
`replacements`. Replacement records contain one-based `data_row`, `category`,
`previous_color` and `mapped_color`. Unmapped/conflicting-data errors expose
`unknown_categories` and `conflicts` arrays.

## Export formats

Each record contains `text`, `extension` and `mime`.

| Record | Content |
| --- | --- |
| `json` | Reloadable version-1 master. |
| `csv` | Reloadable `category,color_hex` table. |
| `r` | Named vector with strict `category_keys()` and `colors_for()` helpers. |
| `python` | Dictionary with equivalent strict helpers. |
| `cytoscape` | `Primary_module_final,Module_name_final,Primary_fill_color_hex`; display name repeats the key. |
| `hex` | Unkeyed HEX list, not a reusable category mapping. |

Generated helpers require text category keys and preserve exact matching after
the same ASCII trimming. R factors are interpreted by label; R missing values and
non-text Python inputs are rejected. Python accepts sequences or iterables of
keys, not a bare string. Existing external plotting code is not modified.

## CSV exports

From `csv.js`:

| Export | Contract |
| --- | --- |
| `MAX_CHARACTERS`, `MAX_ROWS` | 10,000,000 string code units and 50,000 data rows; parser column limit 200. |
| `await readUtf8File(file)` | Reads `size`/`arrayBuffer()`; rejects more than 40,000,000 bytes or invalid UTF-8. |
| `parseTableCsv(text)` | String-cell table; quoted fields, embedded newlines, BOM and CRLF supported. Requires data, unique nonempty trimmed headers and consistent row widths. |
| `assertSpreadsheetSafe(value, context?)` | Conservative formula-like-text rejection; plain negative numeric cells are permitted. |
| `serializeTableCsv(table)` | CSV quoting and LF output with a final newline; does not validate shape or reject formulas. |

Unquoted blank lines are ignored; quoted empty cells remain data rows. Mapping
input has the same text-size limit. Quoting alone is not spreadsheet sanitization.

Fingerprints and reports describe content and an operation, not authorship,
scientific validity or colour accessibility. Real mappings and applied data can
contain sensitive labels and remain separate from these synthetic examples.
