# File Tree Scaffold Generator

An MIT-licensed, dependency-free browser tool with two modes at the same page.

## Text tree

Paste a standard branch tree, preview its validated paths and download a ZIP of
empty files and directories. The original parser and empty-file ZIP writer are
unchanged. Nothing is copied from disk or written directly into a project.

## Research Project Starter

Open [the research tab](index.html#research-project-starter), choose **Dataset
analysis**, **Computational simulation** or **Paper figure workflow**, enter a
safe project folder name, title and optional scientific question, then select
**Preview starter**. Inspect the structure and any individual template before
downloading the project ZIP.

Each preset includes 15 populated Markdown, JSON and CSV templates: README,
current project state, a starting checklist, planning configuration, input notes,
method plan, data contract, decision notes, experiment/artifact registries, an
unfilled run-metadata template, and source/figure documentation. Raw and processed
inputs, configuration, reusable code, executable generators, scratch notebooks,
smoke tests, staging/active/archived results and figures have separate directories.

The state starts at **PLANNING / NOT_RUN**. Both registries contain headers only:
no experiment or artifact is registered and no scientific IDs are allocated. The
26-column experiment schema includes historical provenance, execution status,
scientific outcome and lifecycle separately. Run metadata has null times/hashes
and `template_only: true`; it is not evidence that a run happened.

This is a lightweight starting point, **not a complete project-governance package
or runnable scientific pipeline**. Existing project rules take precedence. No
dataset, executable generator, environment lockfile, reproduction command or
project licence is invented. Decide these for the actual project and add exact
reproduction commands only after real execution. Smoke checks receive no
scientific ID; an engineering PASS is not a scientific conclusion.

## Safety and privacy

- Processing stays in browser memory, without uploads, analytics or automatic
  persistence. Refreshing loses the draft; downloads are explicitly requested.
- Arrow keys, Home and End switch tabs. Switching modes preserves independent
  drafts. Changing any starter setting invalidates its previous preview and ZIP.
- Extract into a new directory; do not merge over an existing project. Preserve
  old outputs and raw source bytes. Read-only raw inputs are a policy, not enforced
  filesystem permissions; the generated .gitignore is not a privacy guarantee.
- Folder names use 1–64 lowercase ASCII letters, digits, hyphens or underscores,
  starting with a letter. Windows reserved names and unsafe paths are rejected.
  Titles support Unicode up to 120 characters; questions up to 2,000 characters.
- Template previews use text nodes. The separate content ZIP writer validates
  paths and records UTF-8 names, real payload sizes and CRC-32. Limits: 250 entries,
  128 KiB/file, 1 MiB/archive. Fixed 1980-01-01 ZIP dates are not execution dates.
- MIT covers the code and explanatory templates distributed in this repository.
  No licence is automatically selected for the project a user creates.

## Local use and evidence

From the repository root, serve on loopback with
`python -m http.server 8000 --bind 127.0.0.1` and open
`http://127.0.0.1:8000/tools/tree-scaffold-generator/`.
Run `npm test` with Node 24 for synthetic engineering checks. No JavaScript package
installation is needed. ZIP payloads should also be checked with an independent
ZIP reader. Engineering tests do not establish scientific validity or real-world
research efficiency.
