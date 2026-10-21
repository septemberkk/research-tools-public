rna_help <- function() {
  paste(c(
    "RNA-seq Differential Expression & Functional Enrichment",
    "edgeR classic exact test; enrichment handoff only (no pathway analysis).",
    "",
    "Usage:",
    "  Rscript run_all.R --help",
    "  Rscript run_all.R --check-environment [--plots]",
    "  Rscript run_all.R --example --output OUTPUT [options]",
    "  Rscript run_all.R --counts FILE --samples FILE --reference GROUP --comparison GROUP --output OUTPUT [options]",
    "",
    "Required for user-supplied inputs:",
    "  --counts FILE        UTF-8 TSV: gene_id and raw integer count columns.",
    "  --samples FILE       UTF-8 TSV: sample_id and group, no other columns.",
    "  --reference GROUP    Reference group, specified explicitly.",
    "  --comparison GROUP   Comparison group; positive logFC means higher here.",
    "  --output OUTPUT      New directory; parent must exist. Never overwrites.",
    "",
    "Options:",
    "  --example            Bundled synthetic counts; fixed groups A (reference), B (comparison).",
    "  --mean-count NUMBER  Retain genes with mean raw count strictly above this value (5).",
    "  --fdr NUMBER         Select genes with BH FDR strictly below this value (0.05).",
    "  --logfc NUMBER       Select genes with absolute log2FC strictly above this value (2).",
    "  --plots              Optional pheatmap heatmap; explicit status for empty selections.",
    "  --heatmap-genes N    Genes per logFC tail for large selections (50).",
    "  --check-environment  Report existing runtime packages; does not install anything.",
    "",
    "Only independent two-group designs are supported. No batch, paired, or repeated-measures model.",
    "Input locations are supplied at runtime, never embedded or recorded in output metadata.",
    "No package installation, network access, identifier mapping, or GO/KEGG execution."
  ), collapse = "\n")
}

rna_parse_args <- function(args) {
  flags <- c("--help", "--check-environment", "--example", "--plots")
  values <- c("--counts", "--samples", "--reference", "--comparison", "--output",
              "--mean-count", "--fdr", "--logfc", "--heatmap-genes")
  parsed <- list()
  i <- 1L
  while (i <= length(args)) {
    option <- args[i]
    if (!option %in% c(flags, values)) rna_abort("Unknown argument. See --help for supported options.")
    key <- sub("^--", "", option)
    if (key %in% names(parsed)) rna_abort(paste0("Duplicate option: ", option))
    if (option %in% flags) {
      parsed[[key]] <- TRUE
    } else {
      if (i == length(args) || grepl("^--", args[i + 1L])) rna_abort(paste0("Missing value for ", option))
      i <- i + 1L
      parsed[[key]] <- rna_scalar_text(args[i], key)
    }
    i <- i + 1L
  }
  if (isTRUE(parsed$help)) {
    if (length(parsed) != 1L) rna_abort("--help is a standalone action.")
    return(list(action = "help"))
  }
  if (isTRUE(parsed[["check-environment"]])) {
    if (any(!names(parsed) %in% c("check-environment", "plots"))) {
      rna_abort("--check-environment accepts only the optional --plots flag.")
    }
    return(list(action = "environment", plots = isTRUE(parsed$plots)))
  }
  if (isTRUE(parsed$example)) {
    if (any(c("counts", "samples", "reference", "comparison") %in% names(parsed))) {
      rna_abort("--example cannot be combined with user-supplied inputs or group labels.")
    }
    parsed$reference <- "A"
    parsed$comparison <- "B"
  }
  required <- c(if (!isTRUE(parsed$example)) c("counts", "samples"), "reference", "comparison", "output")
  if (any(!required %in% names(parsed))) rna_abort("Required options are missing. See --help.")
  numeric_value <- function(key, default) {
    if (is.null(parsed[[key]])) return(default)
    suppressWarnings(as.numeric(parsed[[key]]))
  }
  parsed$config <- rna_config(parsed$reference, parsed$comparison,
                              mean_count = numeric_value("mean-count", 5),
                              fdr = numeric_value("fdr", 0.05),
                              logfc = numeric_value("logfc", 2),
                              heatmap_genes = numeric_value("heatmap-genes", 50))
  parsed$action <- "run"
  parsed$plots <- isTRUE(parsed$plots)
  parsed$example <- isTRUE(parsed$example)
  parsed
}

rna_cli <- function(args, root) {
  parsed <- rna_parse_args(args)
  if (parsed$action == "help") {
    cat(rna_help(), "\n", sep = "")
    return(invisible(NULL))
  }
  if (parsed$action == "environment") {
    print(rna_environment(parsed$plots), row.names = FALSE)
    rna_require_environment(parsed$plots)
    return(invisible(NULL))
  }
  counts_file <- if (parsed$example) file.path(root, "examples", "counts.tsv") else parsed$counts
  samples_file <- if (parsed$example) file.path(root, "examples", "samples.tsv") else parsed$samples
  result <- rna_run(counts_file, samples_file, parsed$output, parsed$config, root,
                    plots = parsed$plots, example = parsed$example)
  cat("Differential expression complete: ", nrow(result$statistics), " tested genes; ",
       sum(result$statistics$significant), " selected. Functional enrichment: NOT RUN.\n", sep = "")
  invisible(result)
}
