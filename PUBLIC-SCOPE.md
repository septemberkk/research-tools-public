# Public selection boundary

This repository is an allowlisted selection, not a mirror of a working toolkit.

The 2026-10-21 extension publishes only:

- Research Project Starter inside the existing File Tree tool, including its
  lightweight explanatory templates and deterministic content-ZIP writer.
- Table Match Checker inside the existing Cytoscape Import Table Builder,
  including a minimal checker-only text/CSV helper.
- Their focused tests, documentation, local navigation and test-runner update.

The original empty-file tree generator, original import-table generator and
already-public Functional Module Evidence Mapping workflow are retained.
MIT licensing is unchanged. The npm package remains `private: true` to prevent
accidental npm publication; this is separate from GitHub repository visibility.

This release does not publish Scientific Palette Explorer, its preset collections
or shared category-colour mapping modules; Enrichment Mapping Reviewer; the full
project-governance package; private toolkit placeholders; or other research
repositories. Existing private repositories remain private. It does not deploy
or modify the personal website, withdraw existing website assets or change
repository visibility.

Only synthetic examples and generic planning templates belong here. Never add
actual research data/results, reviewer sessions/notes, report downloads containing
identifiers, browser QA outputs, local handoffs, attachment images, machine paths,
credentials or an entire private-repository history. Public frontend code is
inspectable when delivered by a website, independently of GitHub visibility.

`tests/public-release-boundary.test.mjs` checks the exact browser-file selection,
local imports/references, no remote runtime/persistence calls, original generator
preservation, integrated tabs, and the exclusion of unapproved components.
