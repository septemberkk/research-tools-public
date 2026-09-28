#!/usr/bin/env python3
"""
Step 05: Build Cytoscape import tables.

This step is deliberately downstream of evidence mapping and heatmap matrix finalization.
It does not re-decide biology. It converts final annotation into Cytoscape-friendly columns.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict

import pandas as pd


def make_result_dirs(result_dir: Path) -> Dict[str, Path]:
    dirs = {
        "final_annotation_tables": result_dir / "01_annotation_evidence" / "final_annotation_tables",
        "cytoscape_import": result_dir / "04_cytoscape_import",
        "reference_tables_used": result_dir / "05_reference_tables_used",
        "run_metadata": result_dir / "06_run_metadata",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def yes_like(x) -> bool:
    return str(x).strip().lower() in {"yes", "y", "true", "1"}


def text_or_default(series: pd.Series, default: str) -> pd.Series:
    values = series.fillna("").astype(str).str.strip()
    return values.mask(values.eq(""), default)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Cytoscape import tables from final annotation table.")
    parser.add_argument("--outdir", default="result", help="Workflow result directory")
    parser.add_argument("--classification-table", help="Optional final annotation CSV for standalone use")
    parser.add_argument("--output-dir", help="Optional directory for Cytoscape CSV outputs")
    parser.add_argument("--default_node_size", type=int, default=42)
    parser.add_argument("--core_node_size", type=int, default=56)
    parser.add_argument("--default_label_size", type=int, default=10)
    parser.add_argument("--core_label_size", type=int, default=12)
    args = parser.parse_args()

    result_dir = Path(args.outdir)
    dirs = make_result_dirs(result_dir) if not (args.classification_table and args.output_dir) else {}
    classification_path = (
        Path(args.classification_table) if args.classification_table
        else dirs["final_annotation_tables"] / "gene_module_classification_total.csv"
    )
    if not classification_path.exists():
        raise FileNotFoundError(classification_path)
    df = pd.read_csv(classification_path)
    if "Gene" not in df.columns:
        raise ValueError("gene_module_classification_total.csv must contain Gene column")
    df["Gene"] = df["Gene"].fillna("").astype(str).str.strip()
    if df["Gene"].eq("").any() or df["Gene"].duplicated().any():
        raise ValueError("Gene identifiers must be nonempty and unique for Cytoscape import")

    cytoscape_dir = Path(args.output_dir) if args.output_dir else dirs["cytoscape_import"]
    cytoscape_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir = cytoscape_dir if args.output_dir else dirs["run_metadata"]

    for col in ["Primary_module_final", "Module_name_final", "Primary_fill_color_hex", "Core_gene", "Show_label"]:
        if col not in df.columns:
            df[col] = ""

    out = pd.DataFrame()
    out["Gene"] = df["Gene"].astype(str)
    out["Primary_module_final"] = text_or_default(df["Primary_module_final"], "Unclassified")
    out["Module_name_final"] = text_or_default(df["Module_name_final"], "")
    out["Module_name_final"] = out["Module_name_final"].mask(
        out["Module_name_final"].eq(""), out["Primary_module_final"]
    )
    out["Primary_fill_color_hex"] = text_or_default(df["Primary_fill_color_hex"], "#BDBDBD")
    out["Label_all_center"] = out["Gene"]
    out["Show_label"] = text_or_default(df["Show_label"], "no")
    out["Node_size_main_px"] = df["Core_gene"].apply(lambda x: args.core_node_size if yes_like(x) else args.default_node_size)
    out["Label_font_size_px"] = df["Show_label"].apply(lambda x: args.core_label_size if yes_like(x) else args.default_label_size)
    out["Border_width_px"] = df["Core_gene"].apply(lambda x: 2.0 if yes_like(x) else 0.8)

    # Keep useful annotation columns if present
    optional_keep = [
        "Selected_terms", "Term_count", "Functional_modules_raw", "Functional_module_count",
        "Functional_subtheme", "Bridge_annotation", "Evidence_basis", "Curation_confidence",
        "Curation_reason", "Manual_curation_applied", "Core_gene"
    ]
    for col in optional_keep:
        if col in df.columns:
            out[col] = df[col]

    cytoscape_node_path = cytoscape_dir / "cytoscape_node_import.csv"
    out.to_csv(cytoscape_node_path, index=False)

    color_cols = ["Primary_module_final", "Module_name_final", "Primary_fill_color_hex"]
    color_table = out[color_cols].drop_duplicates().sort_values("Primary_module_final")
    color_path = cytoscape_dir / "cytoscape_module_color_annotation_import.csv"
    color_table.to_csv(color_path, index=False)

    meta = {
        "step": "05_build_cytoscape_import",
        "run_time": datetime.now().isoformat(timespec="seconds"),
        "classification_input": str(classification_path),
        "outputs": [str(cytoscape_node_path), str(color_path)],
    }
    (metadata_dir / "run_metadata_step05.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    pd.DataFrame([
        {"step_id": "05", "step_name": "build_cytoscape_import", "output_folder": str(cytoscape_node_path.parent), "output_file": cytoscape_node_path.name, "description": "full Cytoscape node import table"},
        {"step_id": "05", "step_name": "build_cytoscape_import", "output_folder": str(color_path.parent), "output_file": color_path.name, "description": "minimal module color annotation table"},
    ]).to_csv(metadata_dir / "output_manifest_step05.csv", index=False)

    print("Done: Step 05 build_cytoscape_import")
    print(f"Exported: {cytoscape_node_path}")
    print(f"Exported: {color_path}")


if __name__ == "__main__":
    main()
