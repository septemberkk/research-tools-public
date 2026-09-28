#!/usr/bin/env python3
"""
Validate enrichment input files for the functional module evidence-mapping pipeline.

Key design:
- ppi_string mode: requires the four standard STRING/PPI enrichment exports:
  enrichment.Process.tsv, enrichment.KEGG.tsv, enrichment.RCTM.tsv, enrichment.WikiPathways.tsv
- custom mode: accepts one or more enrichment files from any source.

This script can be run alone for checking, but the main build script also uses the same logic.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

PPI_REQUIRED_ENRICHMENT_FILES = {
    "Process": "enrichment.Process.tsv",
    "KEGG": "enrichment.KEGG.tsv",
    "Reactome": "enrichment.RCTM.tsv",
    "WikiPathways": "enrichment.WikiPathways.tsv",
}


def resolve_enrichment_inputs(
    enrichment_source: str,
    ppi_enrichment_dir: str | None = None,
    enrichment_files: List[str] | None = None,
    interactive_confirm: bool = False,
) -> List[Path]:
    """
    Resolve enrichment input files according to enrichment source type.

    Parameters
    ----------
    enrichment_source:
        'ppi_string' or 'custom'.
    ppi_enrichment_dir:
        Folder containing STRING/PPI enrichment files. Required for ppi_string mode.
    enrichment_files:
        One or more manually supplied enrichment files. Required for custom mode.
    interactive_confirm:
        If True, ask for confirmation after validation. Default False, so batch runs will not hang.
    """
    if enrichment_source == "ppi_string":
        if ppi_enrichment_dir is None:
            raise ValueError("--ppi_enrichment_dir is required when --enrichment_source ppi_string.")

        ppi_dir = Path(ppi_enrichment_dir)
        missing = []
        resolved_files = []

        print("Detected enrichment_source = ppi_string")
        print("Required STRING/PPI enrichment files:")
        for source_name, filename in PPI_REQUIRED_ENRICHMENT_FILES.items():
            path = ppi_dir / filename
            if path.exists():
                print(f"  [OK]      {filename}")
                resolved_files.append(path)
            else:
                print(f"  [MISSING] {filename}")
                missing.append(filename)

        if missing:
            missing_text = "\n".join([f"  - {x}" for x in missing])
            raise FileNotFoundError(
                "PPI/STRING mode requires all four enrichment files.\n"
                f"Missing files:\n{missing_text}\n\n"
                "Add the missing file(s), or use --enrichment_source custom."
            )

        if interactive_confirm:
            ans = input("Continue with these four PPI/STRING enrichment files? [y/N]: ").strip().lower()
            if ans not in {"y", "yes"}:
                raise SystemExit("Stopped by user confirmation.")

        return resolved_files

    if enrichment_source == "custom":
        enrichment_files = enrichment_files or []
        if not enrichment_files:
            raise ValueError("--enrichment_files requires at least one file when --enrichment_source custom.")

        resolved_files = [Path(x) for x in enrichment_files]
        missing = [str(x) for x in resolved_files if not x.exists()]
        if missing:
            missing_text = "\n".join([f"  - {x}" for x in missing])
            raise FileNotFoundError(f"Some custom enrichment files do not exist:\n{missing_text}")

        print("Detected enrichment_source = custom")
        print("Custom enrichment files:")
        for path in resolved_files:
            print(f"  [OK] {path}")

        if interactive_confirm:
            ans = input("Continue with these custom enrichment file(s)? [y/N]: ").strip().lower()
            if ans not in {"y", "yes"}:
                raise SystemExit("Stopped by user confirmation.")

        return resolved_files

    raise ValueError(f"Unknown enrichment_source: {enrichment_source}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate enrichment input set.")
    parser.add_argument("--enrichment_source", choices=["ppi_string", "custom"], required=True)
    parser.add_argument("--ppi_enrichment_dir", default=None)
    parser.add_argument("--enrichment_files", nargs="*", default=[])
    parser.add_argument("--interactive_confirm", action="store_true")
    args = parser.parse_args()

    files = resolve_enrichment_inputs(
        enrichment_source=args.enrichment_source,
        ppi_enrichment_dir=args.ppi_enrichment_dir,
        enrichment_files=args.enrichment_files,
        interactive_confirm=args.interactive_confirm,
    )
    print("\nResolved enrichment input set:")
    for f in files:
        print(f"  - {f}")


if __name__ == "__main__":
    main()
