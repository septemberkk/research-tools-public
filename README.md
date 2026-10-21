# Research Tools — Public Selection

Small, self-contained browser utilities for research setup and table preparation,
plus a named category-colour mapping core.
Only synthetic examples and generic planning templates are included.

| Component | What it does | What it does not do |
| --- | --- | --- |
| [File Tree Scaffold Generator](tools/tree-scaffold-generator/README.md) | Previews a pasted tree for an empty ZIP, or uses its [Research Project Starter tab](tools/tree-scaffold-generator/index.html#research-project-starter) to generate directories and 15 explanatory project templates. | It does not copy existing files, write directly to disk, run research or supply a complete governance package. |
| [Cytoscape Import Table Builder](tools/cytoscape-import-table-builder/README.md) | Builds node/module CSVs and uses its [Table Match Checker tab](tools/cytoscape-import-table-builder/index.html#table-match-checker) to inspect exact network-to-annotation key coverage and diagnostics. | It does not infer biological modules, automatically repair identifiers, guarantee import, create edges or automate Cytoscape. |
| [Category Color Mapping Core](lib/category-color-mapping/README.md) | Validates named category colours, applies exact-key mappings to tables and exports JSON, CSV, R, Python and Cytoscape lookup text. | It includes no palette webpage, preset collection, research data or network generation. |

The starter and checker are tabs within the two tools, not separate top-level
utilities. Browser input is processed locally without uploading or persisting it.
Project registries contain headers only, and run metadata is an unfilled template.
Downloaded diagnostics retain original identifiers; review them before sharing.

Independent analysis pipelines, including
[Functional Module Evidence Mapping](https://github.com/septemberkk/research-workflow-public/tree/main/workflows/functional-module-evidence-mapping),
are shared in [Research Workflows](https://github.com/septemberkk/research-workflow-public).

## Run locally

From the repository root, serve the static browser tools with any local HTTP
server, for example:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/` and select a tool. No JavaScript packages or build
step are required.

## Development checks

```sh
npm test
```

Use Node 24; no npm package installation is needed. These utilities prepare
files and diagnostics, not scientific conclusions or an import guarantee.

## License and scope

Licensed under the [MIT License](LICENSE).
See [the public-selection boundary](PUBLIC-SCOPE.md) for repository scope.
