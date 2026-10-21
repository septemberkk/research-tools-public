# These tests require the real edgeR namespace; no simulated engine is used.

engine_result <- NULL
test("real classic edgeR engine returns every retained gene", {
  engine_result <- rna_analyze(inputs, config)
  expect_equal(nrow(engine_result$statistics), 51L)
  expect_equal(nrow(engine_result$filtering), 56L)
  expect_equal(colnames(engine_result$pseudo_counts), inputs$samples$sample_id)
})
if (is.null(engine_result)) stop("Engine integration cannot continue without an analysis result.", call. = FALSE)

test("statistics agree with the independent legacy-method call sequence", {
  # Unique synthetic IDs need no ambiguous duplicate-ID aggregation.
  counts <- inputs$counts[rowMeans(inputs$counts) > 5, , drop = FALSE]
  group <- factor(inputs$samples$group, levels = c("A", "B"))
  legacy <- edgeR::DGEList(counts = counts, group = group)
  legacy <- edgeR::calcNormFactors(legacy)
  legacy <- edgeR::estimateCommonDisp(legacy)
  legacy <- edgeR::estimateTagwiseDisp(legacy)
  exact <- edgeR::exactTest(legacy, pair = c("A", "B"))
  expected <- edgeR::topTags(exact, n = 100000)$table
  actual <- engine_result$statistics
  actual <- actual[match(rownames(expected), actual$gene_id), ]
  expect_equal(unname(as.matrix(actual[c("logFC", "logCPM", "PValue", "FDR")])),
                unname(as.matrix(expected)), tolerance = 1e-10)
})
test("BH values use the full retained family", {
  statistics <- engine_result$statistics
  expect_equal(statistics$FDR, stats::p.adjust(statistics$PValue, method = "BH"))
})
test("synthetic effects have the declared contrast direction", {
  statistics <- engine_result$statistics
  up <- match(sprintf("GENE_%03d", 1:4), statistics$gene_id)
  down <- match(sprintf("GENE_%03d", 5:8), statistics$gene_id)
  expect(all(statistics$logFC[up] > 0))
  expect(all(statistics$logFC[down] < 0))
})
test("reversing the contrast reverses logFC with unchanged evidence", {
  reverse <- rna_analyze(inputs, rna_config("B", "A"))$statistics
  forward <- engine_result$statistics
  reverse <- reverse[match(forward$gene_id, reverse$gene_id), ]
  expect_equal(reverse$logFC, -forward$logFC, tolerance = 1e-6)
  expect_equal(reverse$PValue, forward$PValue, tolerance = 1e-6)
  expect_equal(reverse$FDR, forward$FDR, tolerance = 1e-6)
})
test("count-column permutation does not change sample assignment or statistics", {
  shuffled <- rna_analyze(list(counts = inputs$counts[, 6:1], samples = inputs$samples), config)
  expect_equal(shuffled$statistics, engine_result$statistics)
  expect_equal(shuffled$pseudo_counts, engine_result$pseudo_counts)
})
test("real-engine run exports completion and an enrichment handoff only", {
  output <- new_output()
  before <- tools::md5sum(c(counts_file, samples_file))
  result <- rna_run(counts_file, samples_file, output, config, root, example = TRUE)
  expect_equal(read_output(output, "RUN_COMPLETE.tsv")$differential_expression, "complete")
  expect_equal(read_output(output, "RUN_COMPLETE.tsv")$functional_enrichment, "not_run")
  expect_equal(read_output(output, "differential_expression.tsv")$gene_id, result$statistics$gene_id)
  expect_equal(read_output(output, "enrichment_tested_universe.tsv")$gene_id, result$statistics$gene_id)
  expect(identical(before, tools::md5sum(c(counts_file, samples_file))))
  expect(!file.exists(file.path(output, "RUN_FAILED.tsv")))
  expect(!file.exists(file.path(output, "heatmap.pdf")))
})
test("a real-engine empty selection remains a successful DE export", {
  empty_config <- rna_config("A", "B", logfc = 1e6)
  output <- new_output()
  result <- rna_run(counts_file, samples_file, output, empty_config, root, example = TRUE)
  expect_equal(sum(result$statistics$significant), 0L)
  expect_equal(nrow(read_output(output, "selected_genes.tsv")), 0L)
  expect_equal(nrow(read_output(output, "selected_pseudo_counts.tsv")), 0L)
  expect_equal(nrow(read_output(output, "enrichment_tested_universe.tsv")), 51L)
  expect(file.exists(file.path(output, "RUN_COMPLETE.tsv")))
})
test("the actual synthetic CLI completes with the real engine", {
  output <- new_output()
  execution <- run_entry(c("--example", "--output", output))
  expect_equal(execution$status, 0L)
  expect(file.exists(file.path(output, "RUN_COMPLETE.tsv")))
  expect(any(grepl("Functional enrichment: NOT RUN", execution$output, fixed = TRUE)))
})

if ("--plots" %in% args) {
  test("real selected genes produce a PDF and explicit plot audit", {
    expect(any(engine_result$statistics$significant))
    output <- new_output()
    rna_run(counts_file, samples_file, output, config, root, plots = TRUE, example = TRUE)
    expect(file.info(file.path(output, "heatmap.pdf"))$size > 0)
    expect_equal(read_output(output, "heatmap_status.tsv")$status, "created")
    expect(all(read_output(output, "heatmap_genes.tsv")$gene_id %in% engine_result$statistics$gene_id))
  })
  test("a single selected row plots without row clustering", {
    one <- engine_result
    one$statistics <- one$statistics[which(one$statistics$significant)[1L], , drop = FALSE]
    plan <- rna_heatmap_plan(one, config)
    file <- tempfile("single_row_", tmpdir = test_dir, fileext = ".pdf")
    rna_plot_heatmap(one, config, plan, file)
    expect(file.info(file)$size > 0)
  })
  test("requested plotting with no selection creates a status, not a fake heatmap", {
    output <- new_output()
    rna_run(counts_file, samples_file, output, rna_config("A", "B", logfc = 1e6), root, plots = TRUE, example = TRUE)
    expect_equal(read_output(output, "heatmap_status.tsv")$status, "not_created_no_selected_genes")
    expect(!file.exists(file.path(output, "heatmap.pdf")))
    expect(file.exists(file.path(output, "RUN_COMPLETE.tsv")))
  })
}
