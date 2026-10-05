# Research Tools — Public Selection

This repository contains a deliberately small public selection of Yingjie Kang's research tools. It is not a mirror of the private working toolkit, and it contains no real project data or research results. The only bundled example data and preview figure are synthetic.

| Component | What it does | What it does not do |
| --- | --- | --- |
| [File Tree Scaffold Generator](tools/tree-scaffold-generator/) | Previews a pasted file tree and downloads a ZIP of empty folders and files. [Live tool](https://yingjiekang.com/projects/tree-scaffold-generator/) | It does not copy file contents or write directly to disk. |
| [Cytoscape Import Table Builder](tools/cytoscape-import-table-builder/) | Converts a final gene annotation CSV into node and module/color import tables in the browser. [Live tool](https://yingjiekang.com/projects/cytoscape-import-table-builder/) | It does not infer biological modules, create network edges, or automate Cytoscape. |
| [Functional Module Evidence Mapping](cytoscape/workflows/functional-module-evidence-mapping/) | Produces traceable gene annotation evidence, heatmap matrices, and Cytoscape-ready tables from reviewed mappings. | It does not validate biological interpretation or build a Cytoscape network. |

The workflow's bundled `GENE_A`–`GENE_F` input data and previews are synthetic examples, not research findings. The browser tools process input locally; their code does not send it to a server or save it.

## Run locally

From the repository root, serve the static browser tools with any local HTTP server, for example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/` and select a tool. No JavaScript packages or build step are required. The workflow has separate [setup and input instructions](cytoscape/workflows/functional-module-evidence-mapping/README.md).

## Checks

```sh
node --test tests/tree-scaffold-tool.test.mjs tests/cytoscape-import-tool.test.mjs
python -m unittest discover -s cytoscape/workflows/functional-module-evidence-mapping/tests -v
```

The checks cover the browser tools and both synthetic workflow input modes. Real-data interpretation and Cytoscape layout require separate review.

## License

Licensed under the [MIT License](LICENSE).
