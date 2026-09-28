#!/usr/bin/env Rscript
# Plot the final gene-by-module term counts without changing their order.
# Base R is the only plotting dependency.

args <- commandArgs(trailingOnly = TRUE)
get_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) return(args[idx + 1])
  default
}

input_file <- get_arg("--input", "results/example/02_final_heatmap_matrices/gene_module_frequency_matrix.csv")
output_dir <- get_arg("--output_dir", "results/example/03_heatmap_figures")
figure_prefix <- get_arg("--prefix", "gene_module_frequency_heatmap")

if (!file.exists(input_file)) stop(paste0("Input matrix not found: ", input_file))
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

df <- read.csv(input_file, check.names = FALSE, stringsAsFactors = FALSE)
if (!("Gene" %in% colnames(df))) stop("Input matrix must contain a Gene column.")
mat <- as.matrix(df[, setdiff(colnames(df), "Gene"), drop = FALSE])
rownames(mat) <- df$Gene
storage.mode(mat) <- "numeric"
if (anyNA(mat) || any(mat < 0) || any(mat != floor(mat))) {
  stop("The frequency matrix must contain non-negative whole-number counts.")
}

draw_heatmap <- function() {
  par(mar = c(6, 7, 4, 2), bg = "white", family = "sans")
  if (nrow(mat) == 0 || ncol(mat) == 0) {
    plot.new()
    text(0.5, 0.5, "Empty gene-module matrix")
    return(invisible(NULL))
  }

  max_count <- max(mat)
  colors <- colorRampPalette(c("#F6F8FA", "#8CBACB", "#245D7B"))(max_count + 1)
  plot(c(0.5, ncol(mat) + 0.5), c(0.5, nrow(mat) + 0.5),
       type = "n", axes = FALSE, xlab = "", ylab = "", xaxs = "i", yaxs = "i")

  for (i in seq_len(nrow(mat))) {
    y <- nrow(mat) - i + 1
    for (j in seq_len(ncol(mat))) {
      value <- mat[i, j]
      rect(j - 0.5, y - 0.5, j + 0.5, y + 0.5,
           col = colors[value + 1], border = "white", lwd = 2)
      label_color <- if (max_count > 1 && value >= ceiling(max_count / 2)) "white" else "#334155"
      text(j, y, value, col = label_color, cex = 0.85)
    }
  }

  axis(1, at = seq_len(ncol(mat)), labels = colnames(mat), tick = FALSE, cex.axis = 0.85)
  axis(2, at = seq_len(nrow(mat)), labels = rev(rownames(mat)),
       tick = FALSE, las = 1, cex.axis = 0.85)
  box(col = "#D6DEE5")
  title(main = "Mapped term count by gene and module", cex.main = 1.05)
  mtext("Functional module", side = 1, line = 2.2, cex = 0.85)
  mtext("Gene", side = 2, line = 5.5, cex = 0.85)
  mtext("Each cell counts distinct included terms", side = 1, line = 4.2,
        cex = 0.7, col = "#475569")
}

pdf_file <- file.path(output_dir, paste0(figure_prefix, ".pdf"))
png_file <- file.path(output_dir, paste0(figure_prefix, ".png"))
pdf(pdf_file, width = 8, height = max(5, min(12, nrow(mat) * 0.38 + 3)),
    family = "sans", useDingbats = FALSE)
draw_heatmap()
dev.off()

png(png_file, width = 1600, height = max(900, min(2400, nrow(mat) * 80 + 500)),
    res = 180, pointsize = 11)
draw_heatmap()
dev.off()

cat("Done: Step 04 plot_heatmaps\n")
cat("Input:", input_file, "\n")
cat("Exported:", pdf_file, "\n")
cat("Exported:", png_file, "\n")
