# Research Tools — Public Selection

This repository contains a deliberately small public selection of Yingjie Kang's research tools. It is not a mirror of the private working toolkit, and it contains no real project data or research results. The only bundled example data and preview figure are synthetic.

| Component | What it does | What it does not do |
| --- | --- | --- |
| [File Tree Scaffold Generator](tools/tree-scaffold-generator/README.md) | Previews a pasted tree for an empty ZIP, or uses its [Research Project Starter tab](tools/tree-scaffold-generator/index.html#research-project-starter) to generate directories and 15 explanatory project templates. | It does not copy existing files, write directly to disk, run research or supply a complete governance package. |
| [Cytoscape Import Table Builder](tools/cytoscape-import-table-builder/README.md) | Builds node/module CSVs and uses its [Table Match Checker tab](tools/cytoscape-import-table-builder/index.html#table-match-checker) to inspect exact network-to-annotation key coverage and diagnostics. | It does not infer biological modules, automatically repair identifiers, guarantee import, create edges or automate Cytoscape. |
| [Functional Module Evidence Mapping](cytoscape/workflows/functional-module-evidence-mapping/) | Produces traceable gene annotation evidence, heatmap matrices, and Cytoscape-ready tables from reviewed mappings. | It does not validate biological interpretation or build a Cytoscape network. |

The workflow's bundled `GENE_A`–`GENE_F` input data and previews are synthetic examples, not research findings. The browser tools process input locally; their code does not send it to a server or save it.

The starter and checker extend the existing two tools, not two new top-level tools.
Only these additions are included; see [the public-selection boundary](PUBLIC-SCOPE.md).
Project registries contain headers only and run metadata is an unfilled template.
Checker downloads contain original input identifiers and should be kept private.

## Run locally

From the repository root, serve the static browser tools with any local HTTP server, for example:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/` and select a tool. No JavaScript packages or build step are required. The workflow has separate [setup and input instructions](cytoscape/workflows/functional-module-evidence-mapping/README.md).

## Checks

```sh
npm test
python -m unittest discover -s cytoscape/workflows/functional-module-evidence-mapping/tests -v
```

Node 24 is the tested JavaScript runtime; no npm package installation is needed.
The checks cover both original tools, the starter, exact-key diagnostics, and the
public-source boundary, plus both synthetic workflow input modes. Engineering
success is not scientific validation. Native Cytoscape import, real-data
interpretation and real-project efficiency require separate review. This source
update does not deploy the personal website.

## License

Licensed under the [MIT License](LICENSE).
