# Analysis methods

## Differential expression

The analysis accepts raw integer gene counts from independent biological samples
in two explicitly named groups. The comparison is comparison versus reference;
a positive log2 fold change indicates higher expression in the comparison group.

Genes are retained when their mean raw count across the supplied samples is
strictly greater than the mean-count threshold, which defaults to five.
Filtering precedes library-size calculation. Duplicate gene identifiers are
rejected because their aggregation requires an explicit biological decision.

The edgeR call sequence is:

`DGEList` → TMM `calcNormFactors` → `estimateCommonDisp` →
`estimateTagwiseDisp` → `exactTest` → BH `topTags`.

The exact test uses tagwise dispersion. Benjamini–Hochberg adjustment covers
the complete retained gene set. By default, selected genes require both
`FDR < 0.05` and `abs(logFC) > 2`; equality at either boundary is excluded.
All retained genes are exported, without a fixed row-count limit.

The single-factor model does not account for paired samples, repeated measures,
batches or other covariates. Two samples per group is an input minimum, not a
guarantee of adequate power or biological independence. Sample swaps, technical
replication, confounding and raw-count provenance require separate review.

## Expression display

edgeR pseudo-counts are model-derived quantities used by its classic pipeline.
They are exported under that name and must not be treated as general-purpose
normalized expression or substituted for raw counts in a new analysis.

The optional heatmap applies `log2(pseudo_count + 0.001)` followed by row scaling.
For more than 2N selected genes, N genes from each logFC tail are considered;
otherwise all selected genes are considered. N defaults to 50. Columns remain
in analysis order. Constant rows are omitted and recorded. One variable row
is displayed without row clustering; no plottable rows means no PDF.
Plotting does not alter differential-expression statistics.

## Functional-enrichment handoff

Candidate exports contain selected gene IDs and their up/down direction. The
universe export contains every retained gene ID. Neither export maps identifiers
or evaluates gene-set enrichment.

A downstream enrichment analysis must account for organism, identifier namespace,
annotation coverage, database version and the annotation-eligible background.
Unmapped and multiply mapped identifiers need explicit handling. Pathway
significance is not calculated or implied by the exported gene lists.

## Run records

Inputs are read-only, and exports require a fresh output directory. Parameter,
environment and source records accompany the tables. Role-labelled input and
source fingerprints detect content changes during analysis without embedding
input locations in metadata. MD5 fingerprints support provenance comparison,
not security or anonymization. Sample and gene labels remain in exported tables.
