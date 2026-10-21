# RNA-seq Differential Expression & Functional Enrichment

A parameterized R workflow for two-group differential expression with edgeR.
It exports gene-level statistics, an optional heatmap, and candidate/background
gene lists for a separate functional-enrichment analysis.

## Method

| Stage | Method or default |
| --- | --- |
| Input | Raw integer gene counts and a sample-group table |
| Gene filter | Mean raw count **> 5** |
| Normalization | TMM library-size factors |
| Dispersion | Common, then tagwise qCML |
| Differential expression | edgeR classic exact test |
| Multiple testing | Benjamini–Hochberg correction |
| Gene selection | **FDR < 0.05 and absolute log2FC > 2** |

Positive `logFC` means higher expression in the comparison group relative to the
reference group. The model supports independent biological samples in exactly
two groups; paired, longitudinal, batch-adjusted and other multi-factor designs
require a different analysis. See [analysis methods](METHODS.md) for details.

Functional enrichment is a gene-list handoff: identifier mapping and GO/KEGG
calculations are not implemented by this workflow.

## Inputs

Input locations are supplied at runtime, not embedded in the source.

| Input | Columns | Requirements |
| --- | --- | --- |
| Counts TSV | `gene_id`, followed by sample columns | Unique gene and sample IDs; finite, non-negative integer counts |
| Sample TSV | `sample_id`, `group`, in that order | Exactly the same samples as the matrix; two groups; at least two samples per group |

Files use unquoted UTF-8 TSV with headers and no blank lines or missing fields.
Every sample needs a positive library size, and at least two genes must remain
after filtering. Duplicate identifiers, unmatched samples and extra metadata
columns are rejected rather than silently changed or ignored. Samples are
ordered reference-first, preserving metadata order within each group.

Count provenance, biological independence, technical replication and potential
confounding must be established separately. Integer-valued data alone do not
prove that a matrix contains raw counts.

## Run

Requirements: R and a compatible edgeR installation, including its limma
dependency. The optional heatmap also requires pheatmap. The workflow does not
install packages, download data or modify input files.

From this workflow directory:

```sh
Rscript --vanilla run_all.R --help
Rscript --vanilla run_all.R --check-environment
Rscript --vanilla run_all.R --example --output example-output
```

The [synthetic example](examples/README.md) uses groups A (reference) and B
(comparison). Its files are resolved relative to the entry point, independently
of the working directory.

User-supplied runs require `--counts`, `--samples`, `--reference`, `--comparison`
and `--output`. Thresholds can be set with `--mean-count`, `--fdr` and `--logfc`.
`--plots` enables the heatmap; `--heatmap-genes` sets the number of genes per
logFC tail for large selections. The help output lists all options.

The output target must be a new directory with an existing parent. Existing
files are never overwritten. Exit status is 0 for success, 1 for invalid
inputs or export failures, and 2 for unavailable dependencies.

## Outputs

| Output | Contents |
| --- | --- |
| `differential_expression.tsv` | All retained genes: gene_id, logFC, logCPM, PValue, FDR, significant and direction |
| `selected_genes.tsv` | Genes passing both strict selection thresholds |
| `gene_filtering.tsv` | Mean counts and retained/excluded status for all input genes |
| `sample_groups.tsv`, `sample_qc.tsv` | Sample order, library sizes, detected genes, TMM factors and effective library sizes |
| `edger_pseudo_counts.tsv`, `selected_pseudo_counts.tsv` | edgeR's model-derived pseudo-counts, not general-purpose normalized expression |
| `enrichment_candidates.tsv` | Selected gene IDs and up/down direction |
| `enrichment_tested_universe.tsv` | All retained gene IDs, before annotation-coverage filtering |
| `heatmap.pdf` | Optional row-scaled log2(pseudo-count + 0.001) display |
| `heatmap_status.tsv`, `heatmap_genes.tsv` | Plot status, displayed genes and constant-row omissions |
| `run_metadata.tsv`, `session_info.txt` | Parameters, versions, source revision and content fingerprints |
| `RUN_COMPLETE.tsv` / `RUN_FAILED.tsv` | Completion / partial-export status |

Empty selections produce header-only tables. Heatmaps with no selected or
variable genes are explicitly skipped. Functional enrichment remains `not_run`
in the run metadata because pathway analysis is a separate step.

For enrichment, specify organism, identifier namespace, annotation/database
version, mapped and unmapped IDs, the annotation-eligible background, the
statistical method and its multiple-testing correction. The exported universe
is a starting eligibility list, not an annotation-aware background by itself.

Run metadata records content fingerprints by role, not input locations or a
complete command line. MD5 is for provenance matching, not security or
anonymization. Exports retain supplied gene and sample identifiers.

## References and license

[edgeR](https://bioconductor.org/packages/edgeR/) ·
[edgeR User's Guide](https://bioconductor.org/packages/release/bioc/vignettes/edgeR/inst/doc/edgeRUsersGuide.pdf)

Shared under the [MIT License](LICENSE).
