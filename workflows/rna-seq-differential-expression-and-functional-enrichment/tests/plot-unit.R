# Rendering tests use artificial serialization fixtures, not edgeR estimates.

expect_pdf <- function(file) {
  expect(file.exists(file) && file.info(file)$size > 0)
  connection <- file(file, "rb")
  on.exit(close(connection), add = TRUE)
  expect_equal(rawToChar(readBin(connection, "raw", n = 5L)), "%PDF-")
}

test("multiple artificial variable rows render to PDF", {
  result <- serialization_fixture()
  file <- tempfile("heatmap_", tmpdir = test_dir, fileext = ".pdf")
  device <- grDevices::dev.cur()
  rna_plot_heatmap(result, config, rna_heatmap_plan(result, config), file)
  expect_pdf(file)
  expect(identical(grDevices::dev.cur(), device))
})
test("a single artificial variable row renders without clustering", {
  result <- serialization_fixture()
  result$statistics$significant <- c(TRUE, FALSE, FALSE, FALSE)
  file <- tempfile("heatmap_single_", tmpdir = test_dir, fileext = ".pdf")
  rna_plot_heatmap(result, config, rna_heatmap_plan(result, config), file)
  expect_pdf(file)
})
test("plot-enabled serialization records plotted IDs", {
  result <- serialization_fixture()
  output <- new_output()
  rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output, plots = TRUE)
  expect_pdf(file.path(output, "heatmap.pdf"))
  expect_equal(read_output(output, "heatmap_status.tsv")$status, "created")
  expect_equal(read_output(output, "heatmap_genes.tsv")$gene_id, c("TEST_2", "TEST_1"))
})
test("zero artificial selections create no PDF", {
  result <- serialization_fixture()
  result$statistics$significant <- FALSE
  result$statistics$direction <- "not_selected"
  output <- new_output()
  rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output, plots = TRUE)
  expect(!file.exists(file.path(output, "heatmap.pdf")))
  expect_equal(read_output(output, "heatmap_status.tsv")$status, "not_created_no_selected_genes")
  expect(file.exists(file.path(output, "RUN_COMPLETE.tsv")))
})
test("constant artificial selections record omission without plotting", {
  result <- serialization_fixture()
  result$pseudo_counts[c("TEST_1", "TEST_2"), ] <- 10
  output <- new_output()
  rna_write_results(result, config, data.frame(key = "fixture", value = "serialization_only"), output, plots = TRUE)
  expect(!file.exists(file.path(output, "heatmap.pdf")))
  expect_equal(read_output(output, "heatmap_status.tsv")$status, "not_created_constant_rows")
  expect(all(read_output(output, "heatmap_genes.tsv")$status == "omitted_constant"))
})
