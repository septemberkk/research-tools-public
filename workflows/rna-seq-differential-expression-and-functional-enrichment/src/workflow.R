rna_abort <- function(message, class = "rna_validation_error") {
  stop(structure(list(message = message, call = NULL), class = c(class, "error", "condition")))
}

rna_scalar_text <- function(value, name) {
  if (!is.character(value) || length(value) != 1L || is.na(value) ||
      !nzchar(value) || value != trimws(value) || grepl("[[:cntrl:]]", value)) {
    rna_abort(paste0(name, " must be one non-empty value without surrounding whitespace or control characters."))
  }
  value
}

rna_unique_labels <- function(values, name) {
  if (!is.character(values) || !length(values) || anyNA(values) ||
      any(!nzchar(values)) || any(values != trimws(values)) ||
      any(grepl("[[:cntrl:]]", values)) || anyDuplicated(values)) {
    rna_abort(paste0(name, " must be non-empty, unique labels without surrounding whitespace or control characters."))
  }
  invisible(TRUE)
}

rna_config <- function(reference, comparison, mean_count = 5, fdr = 0.05,
                       logfc = 2, heatmap_genes = 50L) {
  reference <- rna_scalar_text(reference, "reference")
  comparison <- rna_scalar_text(comparison, "comparison")
  if (reference == comparison) rna_abort("reference and comparison must differ.")
  for (name in c("mean_count", "fdr", "logfc", "heatmap_genes")) {
    value <- get(name)
    if (!is.numeric(value) || length(value) != 1L || !is.finite(value)) {
      rna_abort(paste0(name, " must be one finite numeric value."))
    }
  }
  if (mean_count < 0) rna_abort("mean_count must be non-negative.")
  if (fdr <= 0 || fdr > 1) rna_abort("fdr must be greater than zero and at most one.")
  if (logfc < 0) rna_abort("logfc must be non-negative.")
  if (heatmap_genes < 1 || heatmap_genes != floor(heatmap_genes) || heatmap_genes > .Machine$integer.max) {
    rna_abort("heatmap_genes must be a positive integer.")
  }
  list(reference = reference, comparison = comparison, mean_count = mean_count,
       fdr = fdr, logfc = logfc, heatmap_genes = as.integer(heatmap_genes))
}

rna_read_tsv <- function(file, role) {
  rna_scalar_text(file, paste0(role, " file"))
  if (!file.exists(file) || dir.exists(file)) rna_abort(paste0(role, " must be a readable TSV file supplied at runtime."))
  connection <- tryCatch(suppressWarnings(base::file(file, "rb")),
                          error = function(error) rna_abort(paste0("Cannot read ", role, " TSV cleanly.")))
  on.exit(close(connection), add = TRUE)
  lines <- tryCatch({
    repeat {
      chunk <- readBin(connection, what = "raw", n = 65536L)
      if (!length(chunk)) break
      if (any(chunk == as.raw(0))) rna_abort(paste0(role, " TSV cannot be parsed cleanly: embedded NUL."))
    }
    seek(connection, where = 0, origin = "start")
    withCallingHandlers(readLines(connection, warn = FALSE, encoding = "UTF-8"),
                         warning = function(warning) rna_abort(paste0(role, " TSV cannot be parsed cleanly.")))
  }, error = function(error) rna_abort(paste0("Cannot read ", role, " TSV cleanly.")))
  if (length(lines) < 2L || any(!nzchar(lines)) ||
      anyNA(iconv(lines, from = "UTF-8", to = "UTF-8", sub = NA))) {
    rna_abort(paste0(role, " TSV needs a UTF-8 header, data rows, and no blank lines."))
  }
  lines[1L] <- sub("^\ufeff", "", lines[1L])
  fields <- strsplit(paste0(lines, "\t__END__"), "\t", fixed = TRUE)
  fields <- lapply(fields, function(row) row[-length(row)])
  widths <- lengths(fields)
  if (widths[1L] < 2L || any(widths != widths[1L])) {
    rna_abort(paste0(role, " TSV has inconsistent field counts; quoted or multiline fields are not supported."))
  }
  rna_unique_labels(fields[[1L]], paste0(role, " column names"))
  values <- matrix(unlist(fields[-1L], use.names = FALSE), ncol = widths[1L], byrow = TRUE)
  result <- as.data.frame(values, stringsAsFactors = FALSE)
  names(result) <- fields[[1L]]
  result
}

rna_read_inputs <- function(counts_file, samples_file, config) {
  counts_table <- rna_read_tsv(counts_file, "counts")
  samples <- rna_read_tsv(samples_file, "samples")
  if (names(counts_table)[1L] != "gene_id" || ncol(counts_table) < 5L) {
    rna_abort("counts must start with gene_id followed by at least four sample columns.")
  }
  rna_unique_labels(counts_table$gene_id, "gene IDs")
  text_counts <- as.matrix(counts_table[-1L])
  if (any(!nzchar(text_counts)) || any(text_counts != trimws(text_counts))) {
    rna_abort("counts contains empty cells or surrounding whitespace.")
  }
  counts <- suppressWarnings(matrix(as.numeric(text_counts), nrow = nrow(text_counts),
                                    dimnames = list(counts_table$gene_id, names(counts_table)[-1L])))
  rna_validate_inputs(counts, samples, config)
}

rna_validate_inputs <- function(counts, samples, config) {
  if (!is.matrix(counts) || !is.numeric(counts) || nrow(counts) < 2L || ncol(counts) < 4L) {
    rna_abort("counts must be a numeric gene-by-sample matrix with at least two genes and four samples.")
  }
  rna_unique_labels(rownames(counts), "gene IDs")
  rna_unique_labels(colnames(counts), "count sample IDs")
  if (any(!is.finite(counts)) || any(counts < 0) || any(counts != floor(counts)) || any(counts > 2^53 - 1)) {
    rna_abort("counts must contain finite, non-negative raw integer counts within exact numeric range; transformed expression is not supported.")
  }
  if (any(colSums(counts) <= 0) || any(colSums(counts) > 2^53 - 1)) {
    rna_abort("Every sample must have a positive library size within exact numeric range.")
  }
  if (!is.data.frame(samples) || !identical(names(samples), c("sample_id", "group"))) {
    rna_abort("samples must have exactly sample_id and group columns; covariates, pairing, and batch effects require a different model.")
  }
  rna_unique_labels(samples$sample_id, "metadata sample IDs")
  if (!is.character(samples$group) || anyNA(samples$group) || any(!nzchar(samples$group)) ||
      any(samples$group != trimws(samples$group)) || any(grepl("[[:cntrl:]]", samples$group))) {
    rna_abort("Each metadata sample needs a non-empty group without surrounding whitespace or control characters.")
  }
  if (!setequal(colnames(counts), samples$sample_id)) {
    rna_abort("counts and samples must contain exactly the same sample IDs; no samples are silently dropped.")
  }
  if (!setequal(unique(samples$group), c(config$reference, config$comparison))) {
    rna_abort("samples must contain exactly the reference and comparison groups.")
  }
  if (any(table(samples$group) < 2L)) {
    rna_abort("At least two independent biological samples per group are required; independence must be established outside this script.")
  }
  order <- c(which(samples$group == config$reference), which(samples$group == config$comparison))
  samples <- samples[order, , drop = FALSE]
  rownames(samples) <- NULL
  list(counts = counts[, samples$sample_id, drop = FALSE], samples = samples)
}

rna_filter_counts <- function(counts, config) {
  means <- rowMeans(counts)
  keep <- means > config$mean_count
  filtered <- counts[keep, , drop = FALSE]
  if (nrow(filtered) < 2L) rna_abort("Fewer than two genes pass the mean-count filter.")
  if (any(colSums(filtered) == 0)) rna_abort("A sample has a zero library size after filtering.")
  list(counts = filtered,
       audit = data.frame(gene_id = rownames(counts), mean_count = means,
                          status = ifelse(keep, "tested", "low_count"), row.names = NULL))
}

rna_environment <- function(plots = FALSE) {
  packages <- c("edgeR", "limma", if (plots) "pheatmap")
  loaded <- vapply(packages, requireNamespace, quietly = TRUE, FUN.VALUE = logical(1L))
  data.frame(package = c("R", packages),
             version = c(as.character(getRversion()), vapply(packages, function(package) {
               if (loaded[[package]]) as.character(utils::packageVersion(package)) else "missing"
             }, character(1L))), available = c(TRUE, unname(loaded)), row.names = NULL)
}

rna_require_environment <- function(plots = FALSE) {
  environment <- rna_environment(plots)
  missing <- environment$package[!environment$available]
  if (length(missing)) {
    rna_abort(paste0("Missing runtime dependencies: ", paste(missing, collapse = ", "),
                     ". No packages were installed."), "rna_missing_dependency")
  }
  invisible(environment)
}

rna_select_genes <- function(statistics, config) {
  if (!is.data.frame(statistics) || !all(c("gene_id", "logFC", "logCPM", "PValue", "FDR") %in% names(statistics))) {
    rna_abort("The differential-expression table has an invalid schema.")
  }
  rna_unique_labels(statistics$gene_id, "tested gene IDs")
  for (name in c("logFC", "logCPM", "PValue", "FDR")) {
    if (!is.numeric(statistics[[name]]) || any(!is.finite(statistics[[name]]))) {
      rna_abort("All tested genes must have finite numeric statistics; missing results are not silently discarded.")
    }
  }
  if (any(statistics$PValue < 0 | statistics$PValue > 1) || any(statistics$FDR < 0 | statistics$FDR > 1)) {
    rna_abort("PValue and FDR must lie between zero and one.")
  }
  statistics$significant <- statistics$FDR < config$fdr & abs(statistics$logFC) > config$logfc
  statistics$direction <- ifelse(!statistics$significant, "not_selected", ifelse(statistics$logFC > 0, "up", "down"))
  statistics
}

rna_analyze <- function(inputs, config) {
  rna_require_environment()
  inputs <- rna_validate_inputs(inputs$counts, inputs$samples, config)
  filtered <- rna_filter_counts(inputs$counts, config)
  group <- factor(inputs$samples$group, levels = c(config$reference, config$comparison))
  y <- edgeR::DGEList(counts = filtered$counts, group = group)
  y <- edgeR::calcNormFactors(y, method = "TMM")
  y <- edgeR::estimateCommonDisp(y)
  y <- edgeR::estimateTagwiseDisp(y)
  exact <- edgeR::exactTest(y, pair = c(config$reference, config$comparison), dispersion = "tagwise")
  table <- edgeR::topTags(exact, n = nrow(y), adjust.method = "BH", sort.by = "PValue")$table
  statistics <- rna_select_genes(data.frame(gene_id = rownames(table), table, row.names = NULL, check.names = FALSE), config)
  if (!setequal(statistics$gene_id, rownames(filtered$counts))) rna_abort("The engine did not return every retained gene.")
  pseudo <- y$pseudo.counts
  if (!is.matrix(pseudo) || !identical(dimnames(pseudo), dimnames(filtered$counts)) || any(!is.finite(pseudo)) || any(pseudo < 0)) {
    rna_abort("edgeR returned invalid pseudo-counts.")
  }
  sample_qc <- data.frame(inputs$samples, raw_library_size = colSums(inputs$counts),
                          detected_genes = colSums(inputs$counts > 0), retained_library_size = y$samples$lib.size,
                          tmm_factor = y$samples$norm.factors,
                          effective_library_size = y$samples$lib.size * y$samples$norm.factors, row.names = NULL)
  if (any(!is.finite(as.matrix(sample_qc[-c(1L, 2L)]))) || any(sample_qc$tmm_factor <= 0) ||
      !is.finite(y$common.dispersion) || any(!is.finite(y$tagwise.dispersion)) || any(y$tagwise.dispersion < 0)) {
    rna_abort("edgeR returned invalid normalization factors or dispersion estimates.")
  }
  list(statistics = statistics, pseudo_counts = pseudo, filtering = filtered$audit,
       samples = inputs$samples, sample_qc = sample_qc, dge = y)
}

rna_matrix_table <- function(matrix) {
  data.frame(gene_id = rownames(matrix), matrix, row.names = NULL, check.names = FALSE)
}

rna_heatmap_plan <- function(result, config) {
  selected <- result$statistics[result$statistics$significant, , drop = FALSE]
  selected <- selected[order(selected$logFC, selected$gene_id), , drop = FALSE]
  count <- nrow(selected)
  if (!count) return(list(status = "not_created_no_selected_genes", genes = character(), omitted = character()))
  n <- config$heatmap_genes
  ids <- if (count > 2 * n) selected$gene_id[c(seq_len(n), seq.int(count - n + 1L, count))] else selected$gene_id
  transformed <- log2(result$pseudo_counts[ids, , drop = FALSE] + 0.001)
  variable <- apply(transformed, 1L, stats::sd) > 0
  list(status = if (any(variable)) "created" else "not_created_constant_rows", genes = ids[variable], omitted = ids[!variable])
}

rna_write_tsv <- function(table, file) {
  utils::write.table(table, file = file, sep = "\t", quote = FALSE, row.names = FALSE,
                     col.names = TRUE, na = "NA", fileEncoding = "UTF-8")
}

rna_check_output <- function(output) {
  rna_scalar_text(output, "output")
  if (file.exists(output) || dir.exists(output)) rna_abort("The output target already exists; existing files are never overwritten.")
  if (!dir.exists(dirname(output))) rna_abort("The output parent directory must already exist.")
  invisible(TRUE)
}

rna_git_state <- function(root) {
  unknown <- c(commit = "unavailable", dirty = "unknown")
  if (!nzchar(Sys.which("git"))) return(unknown)
  tryCatch({
    commit <- suppressWarnings(system2("git", c("-C", shQuote(root), "rev-parse", "HEAD"), stdout = TRUE, stderr = FALSE))
    dirty <- suppressWarnings(system2("git", c("-C", shQuote(root), "status", "--porcelain"), stdout = TRUE, stderr = FALSE))
    if (length(commit) != 1L || !is.null(attr(commit, "status")) || !is.null(attr(dirty, "status"))) return(unknown)
    c(commit = commit, dirty = if (length(dirty)) "true" else "false")
  }, error = function(error) unknown)
}

rna_fingerprints <- function(counts_file, samples_file, root) {
  source_files <- c(file.path(root, "run_all.R"), file.path(root, "src", "workflow.R"), file.path(root, "src", "cli.R"))
  hashes <- suppressWarnings(unname(tools::md5sum(c(counts_file, samples_file, source_files))))
  if (anyNA(hashes)) rna_abort("Input or source fingerprints could not be recorded.")
  setNames(hashes, c("counts_md5", "samples_md5", "entry_point_md5", "workflow_md5", "cli_md5"))
}

rna_metadata <- function(config, inputs, result, counts_file, samples_file, root, plots, example, fingerprints = NULL) {
  git <- rna_git_state(root)
  if (is.null(fingerprints)) fingerprints <- rna_fingerprints(counts_file, samples_file, root)
  environment <- rna_environment(plots)
  values <- c(workflow_version = "0.2.0", timestamp_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
              source_commit = git[["commit"]], source_dirty = git[["dirty"]],
              input_mode = "raw_integer_counts", input_origin = if (example) "bundled_synthetic" else "user_supplied",
              input_locations = "not_recorded", fingerprint_algorithm = "MD5_provenance_only",
              fingerprints,
              reference = config$reference, comparison = config$comparison, contrast = "comparison_vs_reference",
              design = "single_factor_independent_two_group", mean_count_exclusive = config$mean_count,
              fdr_exclusive = config$fdr, abs_log2fc_exclusive = config$logfc, normalization = "TMM",
              dispersion = "common_then_tagwise_qCML", test = "edgeR_exactTest_tagwise", p_adjust = "BH",
              plots_requested = plots, heatmap_genes_per_tail = config$heatmap_genes,
              input_genes = nrow(inputs$counts), tested_genes = nrow(result$statistics),
              selected_genes = sum(result$statistics$significant), samples = ncol(inputs$counts),
              identifier_mapping = "not_run", functional_enrichment = "not_run", random_seed = "not_used_deterministic_workflow",
              setNames(environment$version, paste0("version_", environment$package)))
  data.frame(key = names(values), value = unname(values), row.names = NULL)
}

rna_plot_heatmap <- function(result, config, plan, file) {
  annotation <- data.frame(group = result$samples$group, row.names = result$samples$sample_id)
  values <- log2(result$pseudo_counts[plan$genes, , drop = FALSE] + 0.001)
  grDevices::pdf(file, height = 7, width = 8)
  on.exit(grDevices::dev.off(), add = TRUE)
  plot <- pheatmap::pheatmap(values, annotation_col = annotation,
                            color = grDevices::colorRampPalette(c("blue", "white", "red"))(50),
                            cluster_cols = FALSE, cluster_rows = nrow(values) > 1L,
                            show_colnames = TRUE, scale = "row", fontsize = 8, fontsize_row = 5,
                            main = "Selected genes: row-scaled log2 edgeR pseudo-counts", silent = TRUE)
  grid::grid.newpage()
  grid::grid.draw(plot$gtable)
  invisible(NULL)
}

rna_write_results <- function(result, config, metadata, output, plots = FALSE) {
  rna_check_output(output)
  if (plots && !requireNamespace("pheatmap", quietly = TRUE)) {
    rna_abort("Missing optional plotting dependency: pheatmap. No packages were installed.", "rna_missing_dependency")
  }
  if (!dir.create(output, recursive = FALSE, showWarnings = FALSE)) rna_abort("Cannot create a fresh output directory.")
  complete <- FALSE
  stage <- "tables"
  on.exit({
    if (!complete) try(rna_write_tsv(data.frame(status = "failed", stage = stage,
                                               differential_expression = "incomplete", functional_enrichment = "not_run"),
                                     file.path(output, "RUN_FAILED.tsv")), silent = TRUE)
  }, add = TRUE)
  selected <- result$statistics[result$statistics$significant, , drop = FALSE]
  rna_write_tsv(result$statistics, file.path(output, "differential_expression.tsv"))
  rna_write_tsv(selected, file.path(output, "selected_genes.tsv"))
  rna_write_tsv(result$filtering, file.path(output, "gene_filtering.tsv"))
  rna_write_tsv(result$sample_qc, file.path(output, "sample_qc.tsv"))
  rna_write_tsv(result$samples, file.path(output, "sample_groups.tsv"))
  rna_write_tsv(rna_matrix_table(result$pseudo_counts), file.path(output, "edger_pseudo_counts.tsv"))
  rna_write_tsv(rna_matrix_table(result$pseudo_counts[selected$gene_id, , drop = FALSE]), file.path(output, "selected_pseudo_counts.tsv"))
  rna_write_tsv(selected[c("gene_id", "direction")], file.path(output, "enrichment_candidates.tsv"))
  rna_write_tsv(result$statistics["gene_id"], file.path(output, "enrichment_tested_universe.tsv"))
  plan <- if (plots) rna_heatmap_plan(result, config) else list(status = "not_requested", genes = character(), omitted = character())
  stage <- "plots"
  if (plots && plan$status == "created") rna_plot_heatmap(result, config, plan, file.path(output, "heatmap.pdf"))
  rna_write_tsv(data.frame(status = plan$status, plotted_genes = length(plan$genes), omitted_constant_rows = length(plan$omitted)),
                file.path(output, "heatmap_status.tsv"))
  rna_write_tsv(data.frame(gene_id = c(plan$genes, plan$omitted),
                           status = c(rep("plotted", length(plan$genes)), rep("omitted_constant", length(plan$omitted)))),
                file.path(output, "heatmap_genes.tsv"))
  stage <- "metadata"
  rna_write_tsv(metadata, file.path(output, "run_metadata.tsv"))
  writeLines(capture.output(utils::sessionInfo()), file.path(output, "session_info.txt"), useBytes = TRUE)
  pending <- file.path(output, "RUN_COMPLETE.pending.tsv")
  rna_write_tsv(data.frame(differential_expression = "complete", functional_enrichment = "not_run"), pending)
  if (!file.rename(pending, file.path(output, "RUN_COMPLETE.tsv"))) rna_abort("Cannot finalize the completion marker.")
  complete <- TRUE
  invisible(output)
}

rna_run <- function(counts_file, samples_file, output, config, root, plots = FALSE, example = FALSE) {
  fingerprints <- rna_fingerprints(counts_file, samples_file, root)
  inputs <- rna_read_inputs(counts_file, samples_file, config)
  rna_filter_counts(inputs$counts, config)
  rna_check_output(output)
  rna_require_environment(plots)
  result <- rna_analyze(inputs, config)
  if (!identical(fingerprints, rna_fingerprints(counts_file, samples_file, root))) {
    rna_abort("Input or source content changed during the run; no output directory was created.")
  }
  metadata <- rna_metadata(config, inputs, result, counts_file, samples_file, root, plots, example, fingerprints)
  rna_write_results(result, config, metadata, output, plots)
  invisible(result)
}
