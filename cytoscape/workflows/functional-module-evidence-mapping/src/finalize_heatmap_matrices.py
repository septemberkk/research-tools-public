#!/usr/bin/env python3
"""
Step 03: Finalize heatmap matrices.

This step takes preliminary matrices from Step 02 and turns them into final matrices for plotting.
It is deliberately separate from annotation evidence, because heatmap display choices may be adjusted later:
- gene order
- module order
- core-only filtering
- excluding unclassified genes
- matrix filename cleanup
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import pandas as pd

MODULE_UNCLASSIFIED = "Unclassified"


def make_result_dirs(result_dir: Path) -> Dict[str, Path]:
    dirs = {
        "root": result_dir,
        "annotation_evidence": result_dir / "01_annotation_evidence",
        "preliminary_matrices": result_dir / "01_annotation_evidence" / "preliminary_matrices",
        "final_annotation_tables": result_dir / "01_annotation_evidence" / "final_annotation_tables",
        "final_heatmap_matrices": result_dir / "02_final_heatmap_matrices",
        "run_metadata": result_dir / "06_run_metadata",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(path)
    return pd.read_csv(path)


def ordered_genes(classification: pd.DataFrame, matrix: pd.DataFrame, core_only: bool, exclude_unclassified: bool) -> pd.DataFrame:
    df = classification.copy()
    if core_only and "Core_gene" in df.columns:
        df = df[df["Core_gene"].astype(str).str.lower().isin(["yes", "y", "true", "1"])].copy()
    if exclude_unclassified and "Primary_module_final" in df.columns:
        df = df[df["Primary_module_final"].astype(str) != MODULE_UNCLASSIFIED].copy()

    if "Primary_module_final" not in df.columns:
        df["Primary_module_final"] = MODULE_UNCLASSIFIED
    if "Gene" not in df.columns:
        raise ValueError("classification table must contain Gene column")

    module_order_col = "Module_order_for_sort"
    # If module order was not copied into final table, order by text after keeping classification grouping.
    # Later this can be improved by reading module_dictionary_used.csv.
    module_seen = {m: i for i, m in enumerate(df["Primary_module_final"].dropna().astype(str).drop_duplicates().tolist(), start=1)}
    df[module_order_col] = df["Primary_module_final"].map(module_seen).fillna(999)
    df = df.sort_values([module_order_col, "Gene"]).drop_duplicates("Gene")

    # Keep only genes present in matrix
    matrix_genes = set(matrix["Gene"].astype(str))
    df = df[df["Gene"].astype(str).isin(matrix_genes)].copy()
    return df[["Gene", "Primary_module_final", "Module_name_final"] if "Module_name_final" in df.columns else ["Gene", "Primary_module_final"]]


def reorder_matrix(matrix: pd.DataFrame, gene_order: List[str], keep_cols: List[str] | None = None) -> pd.DataFrame:
    out = pd.DataFrame({"Gene": gene_order}).merge(matrix, on="Gene", how="left")
    out = out.fillna(0)
    if keep_cols is not None:
        keep_cols = [c for c in keep_cols if c in out.columns]
        out = out[["Gene"] + keep_cols]
    for c in out.columns:
        if c != "Gene":
            try:
                out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0).astype(int)
            except Exception:
                pass
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Finalize heatmap matrices from preliminary Step 02 outputs.")
    parser.add_argument("--outdir", default="result")
    parser.add_argument("--core_only", action="store_true", help="Only keep genes marked Core_gene=yes in final matrices.")
    parser.add_argument("--exclude_unclassified", action="store_true", help="Drop Unclassified genes from final matrices.")
    args = parser.parse_args()

    dirs = make_result_dirs(Path(args.outdir))

    classification_path = dirs["final_annotation_tables"] / "gene_module_classification_total.csv"
    binary_path = dirs["preliminary_matrices"] / "preliminary_gene_module_binary_matrix.csv"
    freq_path = dirs["preliminary_matrices"] / "preliminary_gene_module_frequency_matrix.csv"
    pathway_path = dirs["preliminary_matrices"] / "preliminary_gene_pathway_binary_matrix.csv"

    classification = read_csv(classification_path)
    binary = read_csv(binary_path)
    freq = read_csv(freq_path)
    pathway = read_csv(pathway_path)

    gene_order_df = ordered_genes(classification, freq, args.core_only, args.exclude_unclassified)
    gene_order = gene_order_df["Gene"].astype(str).tolist()

    # Module columns follow existing preliminary matrix order.
    module_cols = [c for c in freq.columns if c != "Gene"]

    final_binary = reorder_matrix(binary, gene_order, module_cols)
    final_freq = reorder_matrix(freq, gene_order, module_cols)
    final_pathway = reorder_matrix(pathway, gene_order, None)

    outputs = []
    p = dirs["final_heatmap_matrices"] / "gene_module_binary_matrix.csv"; final_binary.to_csv(p, index=False); outputs.append(p)
    p = dirs["final_heatmap_matrices"] / "gene_module_frequency_matrix.csv"; final_freq.to_csv(p, index=False); outputs.append(p)
    p = dirs["final_heatmap_matrices"] / "gene_pathway_binary_matrix.csv"; final_pathway.to_csv(p, index=False); outputs.append(p)
    p = dirs["final_heatmap_matrices"] / "heatmap_gene_order.csv"; gene_order_df.to_csv(p, index=False); outputs.append(p)

    meta = {
        "step": "03_finalize_heatmap_matrices",
        "run_time": datetime.now().isoformat(timespec="seconds"),
        "core_only": args.core_only,
        "exclude_unclassified": args.exclude_unclassified,
        "genes_in_final_matrix": len(gene_order),
        "outdir": args.outdir,
    }
    (dirs["run_metadata"] / "run_metadata_step03.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    pd.DataFrame([
        {"step_id": "03", "step_name": "finalize_heatmap_matrices", "output_folder": str(p.parent), "output_file": p.name, "description": "final heatmap matrix output"}
        for p in outputs
    ]).to_csv(dirs["run_metadata"] / "output_manifest_step03.csv", index=False)

    print("Done: Step 03 finalize_heatmap_matrices")
    print(f"Genes in final matrices: {len(gene_order)}")
    print(f"Output folder: {dirs['final_heatmap_matrices']}")


if __name__ == "__main__":
    main()
