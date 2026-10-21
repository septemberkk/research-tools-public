#!/usr/bin/env Rscript

local({
  script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(script_arg) != 1L) stop("Run this entry point with Rscript.", call. = FALSE)
  root <- dirname(normalizePath(sub("^--file=", "", script_arg), winslash = "/", mustWork = TRUE))
  source(file.path(root, "src", "workflow.R"), local = TRUE)
  source(file.path(root, "src", "cli.R"), local = TRUE)
  exit_status <- tryCatch({
    rna_cli(commandArgs(trailingOnly = TRUE), root)
    0L
  }, error = function(error) {
    message("ERROR: ", conditionMessage(error))
    if (inherits(error, "rna_missing_dependency")) 2L else 1L
  })
  quit(save = "no", status = exit_status, runLast = FALSE)
})
