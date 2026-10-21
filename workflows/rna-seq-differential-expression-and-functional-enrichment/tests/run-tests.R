#!/usr/bin/env Rscript

script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
if (length(script_arg) != 1L) stop("Run the test entry point with Rscript.", call. = FALSE)
root <- dirname(dirname(normalizePath(sub("^--file=", "", script_arg), winslash = "/", mustWork = TRUE)))
args <- commandArgs(trailingOnly = TRUE)
if (!length(args)) args <- "--all"
suite <- intersect(args, c("--unit", "--plot-unit", "--integration", "--all"))
if (length(suite) != 1L || anyDuplicated(args) ||
    any(!args %in% c("--unit", "--plot-unit", "--integration", "--all", "--plots")) ||
    (suite %in% c("--unit", "--plot-unit") && "--plots" %in% args)) {
  stop("Use --unit, --plot-unit, --integration [--plots], or --all [--plots].", call. = FALSE)
}
source(file.path(root, "src", "workflow.R"))
source(file.path(root, "src", "cli.R"))
source(file.path(root, "tests", "fixtures.R"))

passed <- 0L
failed <- character()
test <- function(name, code) {
  tryCatch({
    force(code)
    passed <<- passed + 1L
    cat("PASS ", name, "\n", sep = "")
  }, error = function(error) {
    failed <<- c(failed, name)
    cat("FAIL ", name, ": ", conditionMessage(error), "\n", sep = "")
  })
}
expect <- function(value) {
  if (!isTRUE(value)) stop("Assertion was not TRUE.", call. = FALSE)
  invisible(TRUE)
}
expect_equal <- function(actual, expected, tolerance = 1e-10) {
  comparison <- all.equal(actual, expected, tolerance = tolerance, check.attributes = TRUE)
  if (!isTRUE(comparison)) stop(paste(comparison, collapse = "; "), call. = FALSE)
  invisible(TRUE)
}
expect_error <- function(code, pattern, class = "error") {
  error <- tryCatch({ force(code); NULL }, error = identity)
  if (is.null(error) || !inherits(error, class) || !grepl(pattern, conditionMessage(error), fixed = TRUE)) {
    stop("Expected error was not raised with the required class/message.", call. = FALSE)
  }
  invisible(error)
}

if (suite %in% c("--unit", "--all")) source(file.path(root, "tests", "unit.R"))
blocked <- FALSE
plot_blocked <- FALSE
if (suite == "--plot-unit") {
  if (!requireNamespace("pheatmap", quietly = TRUE)) {
    plot_blocked <- TRUE
    cat("BLOCKED plot unit tests: missing pheatmap. No packages installed.\n")
  } else {
    source(file.path(root, "tests", "plot-unit.R"))
  }
}
if (suite %in% c("--integration", "--all")) {
  readiness <- rna_environment(plots = "--plots" %in% args)
  if (any(!readiness$available)) {
    blocked <- TRUE
    cat("BLOCKED integration: missing ", paste(readiness$package[!readiness$available], collapse = ", "),
         ". No integration tests executed; no packages installed.\n", sep = "")
  } else {
    source(file.path(root, "tests", "integration.R"))
  }
}
cat("SUMMARY passed=", passed, " failed=", length(failed), " integration_blocked=", blocked,
     " plot_unit_blocked=", plot_blocked, "\n", sep = "")
quit(save = "no", status = if (length(failed)) 1L else if (blocked || plot_blocked) 2L else 0L, runLast = FALSE)
