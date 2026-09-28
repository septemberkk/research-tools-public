# Input schema and interpretation

## Node table

One gene/node column is required. Supported names include `Gene`, `symbol`, `shared name`, `name`, and `#node`. Empty identifiers are removed, duplicates are collapsed, and gene symbols are normalized to uppercase. The node table determines which genes appear in the final annotation and matrices.

Selected enrichment evidence can include genes absent from the node table. Those records remain in the long evidence table and are listed separately in `enrichment_genes_not_in_node_table.csv`; they do not enter the final node annotation or matrices.

## Enrichment tables

Each file needs a term column such as `term_description` and a gene list column such as `matching_genes`. CSV, TSV, and Excel tables are accepted. Gene lists can use `;`, `,`, or `|` separators. The pipeline does not filter by adjusted p value; filter the enrichment export and review the term mapping before running it.

`ppi_string` mode requires the four named STRING enrichment exports. `custom` mode accepts one or more enrichment tables. Descriptions are matched exactly to the mapping table after trimming surrounding whitespace. Review `unmatched_enrichment_terms_report.csv` in every run.

## Module dictionary and term map

`module_dictionary.csv` requires unique, nonempty `Module_ID` values. Display name, six-digit hex color, and `Module_order` are recommended; absent names and colors fall back to the ID and gray. The workflow adds `Unclassified` if absent. The term map needs `term_description` and `Module_ID`; only rows with `include` set to `yes`, `y`, `true`, or `1` are used. One term can map to multiple modules, and each retained mapping appears in the long evidence table. Unknown module identifiers and empty included mapping fields are errors.

## Manual gene curation

`gene_manual_curation.csv` is optional and must have unique gene identifiers. `Primary_module_manual` must be empty or match a dictionary module. Its assignment changes the primary display module and related color, while the long evidence table and preliminary matrices keep the original mapped evidence. Record a `Curation_reason` and `Evidence_basis` when making a real override. The example includes an intentionally blank primary module to verify that empty cells stay empty.

`Display_color_override` is per gene. As a result, the module/color lookup may contain more than one color for a module when individual nodes have color overrides. Use the node import table for exact per-node styling.

## Interpretation limits

Term frequency counts unique mapped term descriptions per gene and module. Pathway binary matrices indicate the presence of selected mapped terms. Automatic primary module selection uses the highest term count, then module order, then module ID. `Core_gene` and label size are presentation heuristics. None of these rules establishes a causal mechanism or validates an enrichment result.
