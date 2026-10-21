# Research Tools — Public Selection

This repository contains a deliberately small public selection of Yingjie Kang's research tools. It is not a mirror of the private working toolkit, and it contains no real project data or research results. The only bundled example data and preview figure are synthetic.

| Component | What it does | What it does not do |
| --- | --- | --- |
| [File Tree Scaffold Generator](tools/tree-scaffold-generator/README.md) | Previews a pasted tree for an empty ZIP, or uses its [Research Project Starter tab](tools/tree-scaffold-generator/index.html#research-project-starter) to generate directories and 15 explanatory project templates. | It does not copy existing files, write directly to disk, run research or supply a complete governance package. |
| [Cytoscape Import Table Builder](tools/cytoscape-import-table-builder/README.md) | Builds node/module CSVs and uses its [Table Match Checker tab](tools/cytoscape-import-table-builder/index.html#table-match-checker) to inspect exact network-to-annotation key coverage and diagnostics. | It does not infer biological modules, automatically repair identifiers, guarantee import, create edges or automate Cytoscape. |
| [Functional Module Evidence Mapping](cytoscape/workflows/functional-module-evidence-mapping/) | Produces traceable gene annotation evidence, heatmap matrices, and Cytoscape-ready tables from reviewed mappings. | It does not validate biological interpretation or build a Cytoscape network. |
| [RNA-seq Differential Expression & Functional Enrichment](workflows/rna-seq-differential-expression-and-functional-enrichment/) | Runs a two-group edgeR exact-test workflow and exports differential-expression tables, an optional heatmap, and gene lists for downstream enrichment. | It does not model paired or multi-factor designs, map identifiers, or perform GO/KEGG analysis. |

Bundled workflow data and previews are synthetic examples, not research findings. The browser tools process input locally; their code does not send it to a server or save it.

The starter and checker extend the existing two tools, not two new top-level tools.
See [the public-selection boundary](PUBLIC-SCOPE.md) for included and excluded components.
Project registries contain headers only and run metadata is an unfilled template.
Checker downloads contain original input identifiers and should be kept private.

## Run locally

From the repository root, serve the static browser tools with any local HTTP server, for example:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/` and select a tool. No JavaScript packages or build step are required.
Functional Module Evidence Mapping has separate [setup and input instructions](cytoscape/workflows/functional-module-evidence-mapping/README.md).
The RNA-seq workflow runs in R; its [usage and input contract](workflows/rna-seq-differential-expression-and-functional-enrichment/README.md) are independent of the browser tools.

## License

Licensed under the [MIT License](LICENSE).
