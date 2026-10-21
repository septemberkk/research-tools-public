test("default parameters match the implemented classic pipeline", {
  expect_equal(config, list(reference = "A", comparison = "B", mean_count = 5, fdr = 0.05, logfc = 2, heatmap_genes = 50L))
})
for (case in list(
  list("same groups", list(reference = "A", comparison = "A"), "must differ"),
  list("empty reference", list(reference = "", comparison = "B"), "non-empty"),
  list("whitespace group", list(reference = " A", comparison = "B"), "whitespace"),
  list("negative mean", list(mean_count = -1), "non-negative"),
  list("zero FDR", list(fdr = 0), "greater than zero"),
  list("FDR above one", list(fdr = 1.01), "at most one"),
  list("nonfinite FDR", list(fdr = Inf), "finite"),
  list("negative fold threshold", list(logfc = -1), "non-negative"),
  list("nonnumeric threshold", list(logfc = "two"), "numeric"),
  list("zero heatmap size", list(heatmap_genes = 0), "positive integer"),
  list("fractional heatmap size", list(heatmap_genes = 1.5), "positive integer"),
  list("vector threshold", list(mean_count = c(1, 2)), "one finite"))) {
  test(paste("rejects", case[[1L]]), {
    options <- modifyList(list(reference = "A", comparison = "B"), case[[2L]])
    expect_error(do.call(rna_config, options), case[[3L]])
  })
}

test("synthetic input has the documented dimensions and exact labels", {
  expect_equal(dim(inputs$counts), c(56L, 6L))
  expect(identical(colnames(inputs$counts), inputs$samples$sample_id))
  expect_equal(inputs$samples$group, c("A", "A", "A", "B", "B", "B"))
})
test("input reads do not change bundled files", {
  before <- tools::md5sum(c(counts_file, samples_file))
  rna_read_inputs(counts_file, samples_file, config)
  expect(identical(before, tools::md5sum(c(counts_file, samples_file))))
})
test("sample order follows metadata within each reference-first group", {
  metadata <- inputs$samples[c(6, 3, 4, 1, 5, 2), ]
  reordered <- rna_validate_inputs(inputs$counts[, 6:1], metadata, config)
  expect_equal(reordered$samples$sample_id, c("S03", "S01", "S02", "S06", "S04", "S05"))
  expect(identical(colnames(reordered$counts), reordered$samples$sample_id))
  expect_equal(reordered$counts[, "S02"], inputs$counts[, "S02"])
})
test("UTF-8 BOM is accepted without changing the schema", {
  file <- new_file(c("\ufeffsample_id\tgroup", "S01\tA", "S02\tB"))
  expect_equal(names(rna_read_tsv(file, "samples")), c("sample_id", "group"))
})
for (case in list(
  list("blank lines", c("a\tb", "x\ty", ""), "no blank lines"),
  list("missing row fields", c("a\tb", "x"), "inconsistent field"),
  list("extra row fields", c("a\tb", "x\ty\tz"), "inconsistent field"),
  list("duplicate columns", c("a\ta", "x\ty"), "unique labels"),
  list("blank column label", c("a\t", "x\ty"), "non-empty"),
  list("header only", "a\tb", "data rows"))) {
  test(paste("TSV rejects", case[[1L]]), expect_error(rna_read_tsv(new_file(case[[2L]]), "fixture"), case[[3L]]))
}
test("missing input failure does not expose a location", {
  error <- expect_error(rna_read_tsv(file.path(test_dir, "private-input.tsv"), "counts"), "readable TSV")
  expect(!grepl(test_dir, conditionMessage(error), fixed = TRUE))
})
test("directory is not a TSV file", expect_error(rna_read_tsv(test_dir, "counts"), "readable TSV"))
test("embedded NUL is rejected rather than silently truncating a count", {
  file <- tempfile("nul_fixture_", tmpdir = test_dir, fileext = ".tsv")
  writeBin(c(charToRaw("a\tb\nx\t2"), as.raw(0), charToRaw("suffix\n")), file)
  expect_error(rna_read_tsv(file, "fixture"), "cleanly", "rna_validation_error")
})
test("invalid UTF-8 is rejected", {
  file <- tempfile("encoding_fixture_", tmpdir = test_dir, fileext = ".tsv")
  writeBin(c(charToRaw("a\tb\nx\t"), as.raw(255), charToRaw("\n")), file)
  expect_error(rna_read_tsv(file, "fixture"), "TSV", "rna_validation_error")
})
test("a valid TSV does not require a final newline", {
  file <- tempfile("no_newline_fixture_", tmpdir = test_dir, fileext = ".tsv")
  writeBin(charToRaw("a\tb\nx\ty"), file)
  expect_equal(rna_read_tsv(file, "fixture")$b, "y")
})
test("control characters in identifiers are rejected", {
  expect_error(rna_unique_labels(c("valid", "bad\rlabel"), "IDs"), "control characters")
})

for (value in c(-1, 0.5, NA_real_, NaN, Inf, 2^53)) {
  test(paste("rejects invalid numeric count", value), {
    bad <- inputs$counts
    bad[1, 1] <- value
    expect_error(rna_validate_inputs(bad, inputs$samples, config), "raw integer counts")
  })
}
for (value in c("oops", "NA", "1.5", "-2", "", " 2")) {
  test(paste("rejects invalid TSV count token", dQuote(value)), {
    bad <- rna_matrix_table(inputs$counts)
    bad[1, 2] <- value
    expect_error(rna_read_inputs(new_tsv(bad), samples_file, config),
                 if (value == "" || value == " 2") "empty cells or surrounding whitespace" else "raw integer counts")
  })
}
test("duplicate gene IDs are not silently averaged", {
  bad <- inputs$counts
  rownames(bad)[2] <- rownames(bad)[1]
  expect_error(rna_validate_inputs(bad, inputs$samples, config), "gene IDs")
})
test("missing gene IDs are rejected", {
  bad <- inputs$counts
  rownames(bad) <- NULL
  expect_error(rna_validate_inputs(bad, inputs$samples, config), "gene IDs")
})
test("duplicate matrix samples are rejected", {
  bad <- inputs$counts
  colnames(bad)[2] <- colnames(bad)[1]
  expect_error(rna_validate_inputs(bad, inputs$samples, config), "count sample IDs")
})
test("zero raw library is rejected", {
  bad <- inputs$counts
  bad[, 1] <- 0
  expect_error(rna_validate_inputs(bad, inputs$samples, config), "positive library size")
})
test("extra covariates are never silently ignored", {
  bad <- inputs$samples
  bad$batch <- "one"
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "different model")
})
test("metadata column order is explicit", {
  expect_error(rna_validate_inputs(inputs$counts, inputs$samples[2:1], config), "exactly sample_id and group")
})
test("duplicate metadata samples are rejected", {
  bad <- inputs$samples
  bad$sample_id[2] <- bad$sample_id[1]
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "metadata sample IDs")
})
test("sample mismatch is rejected", {
  bad <- inputs$samples
  bad$sample_id[1] <- "OTHER"
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "exactly the same sample IDs")
})
test("extra matrix samples are not excluded", {
  expect_error(rna_validate_inputs(inputs$counts, inputs$samples[-1, ], config), "exactly the same sample IDs")
})
test("third group is rejected", {
  bad <- inputs$samples
  bad$group[1] <- "C"
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "exactly the reference and comparison")
})
test("single replicate group is rejected", {
  bad <- inputs$samples
  bad$group <- c("A", rep("B", 5))
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "At least two")
})
test("empty group is rejected", {
  bad <- inputs$samples
  bad$group[1] <- ""
  expect_error(rna_validate_inputs(inputs$counts, bad, config), "non-empty group")
})
test("count header must start with gene_id", {
  bad <- rna_matrix_table(inputs$counts)
  names(bad)[1] <- "id"
  expect_error(rna_read_inputs(new_tsv(bad), samples_file, config), "start with gene_id")
})
test("duplicate count headers are checked before name repair", {
  lines <- readLines(counts_file)
  lines[1] <- sub("S02", "S01", lines[1], fixed = TRUE)
  expect_error(rna_read_inputs(new_file(lines), samples_file, config), "counts column names")
})

test("default filtering retains 51 features and excludes five", {
  filtered <- rna_filter_counts(inputs$counts, config)
  expect_equal(nrow(filtered$counts), 51L)
  expect_equal(sum(filtered$audit$status == "low_count"), 5L)
  expect(!"GENE_053" %in% rownames(filtered$counts))
  expect("GENE_054" %in% rownames(filtered$counts))
})
test("filter rejects an empty retained set", {
  expect_error(rna_filter_counts(inputs$counts, rna_config("A", "B", mean_count = 1e9)), "Fewer than two")
})
test("filter rejects a zero retained library", {
  bad <- rbind(c(30, 40, 0, 0, 0, 0), c(40, 30, 0, 0, 0, 0), c(0, 0, 1, 1, 1, 1))
  expect_error(rna_filter_counts(bad, config), "zero library size after filtering")
})
test("threshold equality is excluded in both fold-change directions", {
  table <- data.frame(gene_id = paste0("T", 1:6), logFC = c(3, -3, 2, -2, 3, 3),
                       logCPM = 4, PValue = 0.001, FDR = c(0.049, 0.049, 0.001, 0.001, 0.05, 0))
  result <- rna_select_genes(table, config)
  expect_equal(result$significant, c(TRUE, TRUE, FALSE, FALSE, FALSE, TRUE))
  expect_equal(result$direction, c("up", "down", "not_selected", "not_selected", "not_selected", "up"))
})
test("missing statistics are not silently dropped", {
  table <- serialization_fixture()$statistics
  table$FDR[1] <- NA_real_
  expect_error(rna_select_genes(table, config), "not silently discarded")
})
test("invalid probabilities are rejected", {
  table <- serialization_fixture()$statistics
  table$PValue[1] <- 1.1
  expect_error(rna_select_genes(table, config), "between zero and one")
})
test("duplicate tested IDs are rejected", {
  table <- serialization_fixture()$statistics
  table$gene_id[2] <- table$gene_id[1]
  expect_error(rna_select_genes(table, config), "tested gene IDs")
})

test("heatmap planning handles zero selected genes", {
  result <- serialization_fixture()
  result$statistics$significant <- FALSE
  expect_equal(rna_heatmap_plan(result, config)$status, "not_created_no_selected_genes")
})
test("heatmap planning keeps one variable row", {
  result <- serialization_fixture()
  result$statistics$significant <- c(TRUE, FALSE, FALSE, FALSE)
  plan <- rna_heatmap_plan(result, config)
  expect_equal(plan$status, "created")
  expect_equal(plan$genes, "TEST_1")
})
test("heatmap planning records constant-row omission", {
  result <- serialization_fixture()
  result$pseudo_counts[c("TEST_1", "TEST_2"), ] <- 10
  plan <- rna_heatmap_plan(result, config)
  expect_equal(plan$status, "not_created_constant_rows")
  expect_equal(sort(plan$omitted), c("TEST_1", "TEST_2"))
})
test("large heatmaps use both logFC tails without duplicate rows", {
  result <- serialization_fixture()
  result$statistics$significant <- TRUE
  plan <- rna_heatmap_plan(result, rna_config("A", "B", heatmap_genes = 1))
  expect_equal(plan$genes, c("TEST_2", "TEST_1"))
})

test("output target cannot be an existing directory", expect_error(rna_check_output(test_dir), "never overwritten"))
test("output target cannot be an existing file", expect_error(rna_check_output(counts_file), "never overwritten"))
test("output parent must exist", expect_error(rna_check_output(file.path(new_output(), "child")), "parent directory"))
test("a fresh output is accepted without being created", {
  output <- new_output()
  rna_check_output(output)
  expect(!file.exists(output))
})
test("TSV serialization has a real gene_id header and no synthetic header row", {
  result <- serialization_fixture()
  output <- new_output()
  rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output)
  table <- read_output(output, "selected_genes.tsv")
  expect_equal(names(table), c("gene_id", "logFC", "logCPM", "PValue", "FDR", "significant", "direction"))
  expect_equal(table$gene_id, c("TEST_1", "TEST_2"))
  expect_equal(nrow(read_output(output, "edger_pseudo_counts.tsv")), 4L)
  expect_equal(read_output(output, "RUN_COMPLETE.tsv")$functional_enrichment, "not_run")
  expect_equal(read_output(output, "heatmap_status.tsv")$status, "not_requested")
  expect(!file.exists(file.path(output, "heatmap.pdf")))
})
test("empty selections serialize to readable header-only tables", {
  result <- serialization_fixture()
  result$statistics$significant <- FALSE
  result$statistics$direction <- "not_selected"
  output <- new_output()
  rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output)
  for (name in c("selected_genes.tsv", "selected_pseudo_counts.tsv", "enrichment_candidates.tsv", "heatmap_genes.tsv")) {
    expect_equal(nrow(read_output(output, name)), 0L)
  }
  expect_equal(nrow(read_output(output, "enrichment_tested_universe.tsv")), 4L)
})
test("partial export failure leaves no completion marker", {
  result <- serialization_fixture()
  result$pseudo_counts <- result$pseudo_counts[-1, , drop = FALSE]
  output <- new_output()
  expect_error(rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output), "")
  expect(file.exists(file.path(output, "RUN_FAILED.tsv")))
  expect(!file.exists(file.path(output, "RUN_COMPLETE.tsv")))
})
test("existing results are not overwritten by a second export", {
  output <- new_output()
  result <- serialization_fixture()
  metadata <- data.frame(key = "fixture", value = "serialization_only")
  rna_write_results(result, config, metadata, output)
  before <- tools::md5sum(list.files(output, full.names = TRUE))
  expect_error(rna_write_results(result, config, metadata, output), "never overwritten")
  expect(identical(before, tools::md5sum(list.files(output, full.names = TRUE))))
})
test("metadata fingerprints content without input locations or command lines", {
  metadata <- rna_metadata(config, inputs, serialization_fixture(), counts_file, samples_file, root, FALSE, TRUE)
  expect(!any(grepl(normalizePath(root, winslash = "/"), metadata$value, fixed = TRUE)))
  expect(!any(grepl(counts_file, metadata$value, fixed = TRUE)))
  expect_equal(metadata$value[metadata$key == "counts_md5"], unname(tools::md5sum(counts_file)))
  expect_equal(metadata$value[metadata$key == "functional_enrichment"], "not_run")
  expect(!anyDuplicated(metadata$key))
})
test("fingerprints are role-labelled and detect changed input content", {
  copied <- new_tsv(rna_matrix_table(inputs$counts))
  before <- rna_fingerprints(copied, samples_file, root)
  changed <- rna_matrix_table(inputs$counts)
  changed[1, 2] <- changed[1, 2] + 1
  rna_write_tsv(changed, copied)
  after <- rna_fingerprints(copied, samples_file, root)
  expect_equal(names(before), c("counts_md5", "samples_md5", "entry_point_md5", "workflow_md5", "cli_md5"))
  expect(!identical(before[["counts_md5"]], after[["counts_md5"]]))
  expect(identical(before[-1], after[-1]))
})
test("failed fingerprinting returns a generic error without a location", {
  file <- file.path(test_dir, "absent-private-input.tsv")
  error <- expect_error(rna_fingerprints(file, samples_file, root), "fingerprints could not be recorded")
  expect(!grepl(file, conditionMessage(error), fixed = TRUE))
})

test("CLI help parses without runtime packages", expect_equal(rna_parse_args("--help")$action, "help"))
test("CLI example resolves fixed comparison labels", {
  parsed <- rna_parse_args(c("--example", "--output", "synthetic-review"))
  expect_equal(parsed$config, config)
  expect(parsed$example && !parsed$plots)
})
test("CLI accepts explicit user input roles and threshold overrides", {
  parsed <- rna_parse_args(c("--counts", "COUNTS", "--samples", "SAMPLES", "--reference", "A", "--comparison", "B",
                             "--output", "OUT", "--fdr", "0.01", "--logfc", "1", "--plots"))
  expect_equal(parsed$config$fdr, 0.01)
  expect_equal(parsed$config$logfc, 1)
  expect(parsed$plots && !parsed$example)
})
for (case in list(
  list("no arguments", character(), "Required options"),
  list("unknown option", "--unknown", "Unknown argument"),
  list("duplicate option", c("--example", "--example"), "Duplicate option"),
  list("missing value", c("--example", "--output"), "Missing value"),
  list("option as missing value", c("--output", "--plots"), "Missing value"),
  list("example input override", c("--example", "--counts", "COUNTS"), "cannot be combined"),
  list("example reference override", c("--example", "--reference", "X"), "cannot be combined"),
  list("invalid numeric option", c("--example", "--output", "OUT", "--fdr", "invalid"), "finite numeric"),
  list("mixed help", c("--help", "--plots"), "standalone"),
  list("mixed environment", c("--check-environment", "--example"), "accepts only"))) {
  test(paste("CLI rejects", case[[1L]]), expect_error(rna_parse_args(case[[2L]]), case[[3L]]))
}
test("actual CLI help works from the test process", {
  execution <- run_entry("--help")
  expect_equal(execution$status, 0L)
  expect(any(grepl("enrichment handoff only", execution$output, fixed = TRUE)))
})
test("actual CLI validation returns non-zero before creating output", {
  output <- new_output()
  execution <- run_entry(c("--example", "--output", output, "--fdr", "-1"))
  expect_equal(execution$status, 1L)
  expect(!dir.exists(output))
})
test("missing runtime cannot create successful outputs", {
  if (any(!rna_environment()$available)) {
    output <- new_output()
    execution <- run_entry(c("--example", "--output", output))
    expect_equal(execution$status, 2L)
    expect(any(grepl("No packages were installed", execution$output, fixed = TRUE)))
    expect(!dir.exists(output))
  } else {
    expect(all(rna_environment()$available))
  }
})
test("all R sources and test suites parse", {
  files <- c(file.path(root, "run_all.R"), list.files(file.path(root, "src"), "[.]R$", full.names = TRUE),
             list.files(file.path(root, "tests"), "[.]R$", full.names = TRUE))
  for (file in files) parse(file)
})
