# Category Color Mapping Core

A small JavaScript core for keeping named categories consistent across tables,
figures and exported plotting code. Category keys determine colours; row order,
repeated observations and subsets do not assign new colours.

The core validates mappings, reads JSON or CSV, applies colours to a table, and
produces JSON, CSV, R, Python and Cytoscape lookup exports. An additional HEX list
contains colours only and does not preserve category identity.

Matching is case-sensitive after boundary ASCII whitespace trimming. Unknown
categories and conflicting existing colours block output unless an applicable
fallback or replacement policy is explicitly supplied. Source tables and mapping
objects are not modified.

This directory is independent of any webpage or palette collection. It has no
external package dependencies. R and Python outputs are generated lookup helpers,
not installed language packages. Cytoscape output is a lookup table, not a network,
style or session.

[API](API.md) defines the interfaces and limits.
[The synthetic example](examples/example.mjs) runs with Node 24 as
`node examples/example.mjs`, prints mapped data and an operation report, and writes
no files. Its category names, observations and colours are illustrative, not
research findings or palette recommendations.

Licensed under the [MIT License](LICENSE).
