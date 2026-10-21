config <- rna_config("A", "B")
counts_file <- file.path(root, "examples", "counts.tsv")
samples_file <- file.path(root, "examples", "samples.tsv")
inputs <- rna_read_inputs(counts_file, samples_file, config)

test_dir <- tempfile("rna_workflow_test_")
if (!dir.create(test_dir, recursive = FALSE)) stop("Cannot create the test sandbox.")

new_file <- function(lines) {
  file <- tempfile("fixture_", tmpdir = test_dir, fileext = ".tsv")
  writeLines(lines, file, useBytes = TRUE)
  file
}

new_tsv <- function(table) {
  file <- tempfile("fixture_", tmpdir = test_dir, fileext = ".tsv")
  rna_write_tsv(table, file)
  file
}

new_output <- function() tempfile("output_", tmpdir = test_dir)

read_output <- function(output, name) {
  utils::read.delim(file.path(output, name), check.names = FALSE, stringsAsFactors = FALSE)
}

serialization_fixture <- function() {
  statistics <- data.frame(gene_id = paste0("TEST_", 1:4), logFC = c(3, -4, 2, 1),
                            logCPM = rep(4, 4), PValue = c(0.001, 0.002, 0.003, 0.5),
                            FDR = c(0.01, 0.02, 0.03, 0.5))
  statistics <- rna_select_genes(statistics, config)
  counts <- matrix(c(10, 20, 30, 40, 50, 60, 20, 30, 40, 50, 60, 70,
                     30, 40, 50, 60, 70, 80, 40, 50, 60, 70, 80, 90),
                    nrow = 4, byrow = TRUE, dimnames = list(statistics$gene_id, inputs$samples$sample_id))
  list(statistics = statistics, pseudo_counts = counts,
       filtering = data.frame(gene_id = statistics$gene_id, mean_count = rowMeans(counts), status = "tested"),
       samples = inputs$samples, sample_qc = data.frame(inputs$samples, raw_library_size = colSums(counts)),
       dge = NULL)
}

run_entry <- function(args) {
  executable <- file.path(R.home("bin"), if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript")
  result <- suppressWarnings(system2(executable,
                                     vapply(c("--vanilla", file.path(root, "run_all.R"), args), shQuote, character(1L)),
                                     stdout = TRUE, stderr = TRUE))
  list(status = if (is.null(attr(result, "status"))) 0L else attr(result, "status"), output = result)
}
