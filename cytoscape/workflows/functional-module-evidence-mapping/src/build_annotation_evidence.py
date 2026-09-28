#!/usr/bin/env python3
"""
Step 02: Build annotation evidence.

This step is the first real analysis step. It creates:
- gene-term-module long evidence table
- gene-level evidence summary
- final annotation table with optional manual curation
- preliminary gene × module matrices

The output is intentionally placed under:
result/01_annotation_evidence/

Because this step is where the evidence chain and the first final gene annotation are built.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd

# Allow importing validate_enrichment_inputs.py from the same folder
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from validate_enrichment_inputs import resolve_enrichment_inputs


MODULE_UNCLASSIFIED = "Unclassified"


def make_result_dirs(result_dir: Path) -> Dict[str, Path]:
    """Create output folders for the new expandable pipeline structure."""
    dirs = {
        "root": result_dir,
        "annotation_evidence": result_dir / "01_annotation_evidence",
        "evidence_mapping": result_dir / "01_annotation_evidence" / "evidence_mapping",
        "final_annotation_tables": result_dir / "01_annotation_evidence" / "final_annotation_tables",
        "preliminary_matrices": result_dir / "01_annotation_evidence" / "preliminary_matrices",
        "final_heatmap_matrices": result_dir / "02_final_heatmap_matrices",
        "heatmap_figures": result_dir / "03_heatmap_figures",
        "cytoscape_import": result_dir / "04_cytoscape_import",
        "reference_tables_used": result_dir / "05_reference_tables_used",
        "run_metadata": result_dir / "06_run_metadata",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def read_table_auto(path: Path) -> pd.DataFrame:
    """Read csv/tsv/xlsx automatically."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    suffix = path.suffix.lower()
    if suffix in {".tsv", ".txt"}:
        return pd.read_csv(path, sep="\t")
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    # Fallback: try tab, then comma
    try:
        return pd.read_csv(path, sep="\t")
    except Exception:
        return pd.read_csv(path)


def normalize_colname(c: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(c).strip().lower()).strip("_")


def find_column(df: pd.DataFrame, candidates: List[str], required: bool = True) -> Optional[str]:
    """Find a column using normalized candidate names and broad keyword matching."""
    norm_map = {c: normalize_colname(c) for c in df.columns}
    candidate_norm = [normalize_colname(x) for x in candidates]

    # Exact normalized match first
    for col, norm in norm_map.items():
        if norm in candidate_norm:
            return col

    # Keyword contains match
    for col, norm in norm_map.items():
        for cand in candidate_norm:
            parts = [p for p in cand.split("_") if p]
            if parts and all(p in norm for p in parts):
                return col

    if required:
        raise ValueError(
            f"Cannot find required column. Candidate names: {candidates}\n"
            f"Available columns: {list(df.columns)}"
        )
    return None


def normalize_gene(g: object) -> Optional[str]:
    if pd.isna(g):
        return None
    s = str(g).strip()
    if not s:
        return None
    # remove simple wrappers, keep first token before spaces/parentheses
    s = s.replace('"', "").replace("'", "").strip()
    s = re.split(r"\s+|\(", s)[0]
    s = s.strip()
    return s.upper() if s else None


def split_genes(x: object) -> List[str]:
    if pd.isna(x):
        return []
    s = str(x).strip()
    if not s:
        return []
    parts = re.split(r"[;,|]", s)
    out = []
    for p in parts:
        g = normalize_gene(p)
        if g:
            out.append(g)
    return out


def yes_like(x: object) -> bool:
    return str(x).strip().lower() in {"yes", "y", "true", "1"}


def clean_text(series: pd.Series) -> pd.Series:
    """Keep empty table cells empty across pandas versions."""
    return series.fillna("").astype(str).str.strip()


def load_node_table(path: Path) -> pd.DataFrame:
    df = read_table_auto(path)
    gene_col = find_column(df, ["Gene", "gene", "symbol", "shared name", "name", "#node"], required=True)
    out = pd.DataFrame({"Gene": df[gene_col].map(normalize_gene)})
    out = out.dropna(subset=["Gene"]).drop_duplicates(subset=["Gene"]).reset_index(drop=True)
    if out.empty:
        raise ValueError("No valid genes/nodes extracted from node table.")
    return out


def load_module_dictionary(path: Path) -> pd.DataFrame:
    df = read_table_auto(path)
    module_col = find_column(df, ["Module_ID", "module", "module_id"], required=True)
    name_col = find_column(df, ["Module_name", "module_name", "name", "display_name"], required=False)
    color_col = find_column(df, ["Primary_fill_color_hex", "color", "fill_color", "hex"], required=False)
    order_col = find_column(df, ["Module_order", "order", "module_order"], required=False)

    out = pd.DataFrame()
    out["Module_ID"] = clean_text(df[module_col])
    out["Module_name"] = clean_text(df[name_col]) if name_col else out["Module_ID"]
    out["Primary_fill_color_hex"] = clean_text(df[color_col]) if color_col else "#BDBDBD"
    if out["Module_ID"].eq("").any():
        raise ValueError("module_dictionary contains an empty Module_ID")
    if out["Module_ID"].duplicated().any():
        raise ValueError("module_dictionary contains duplicate Module_ID values")
    out["Module_name"] = out["Module_name"].mask(out["Module_name"].eq(""), out["Module_ID"])
    out["Primary_fill_color_hex"] = out["Primary_fill_color_hex"].mask(
        out["Primary_fill_color_hex"].eq(""), "#BDBDBD"
    )
    if not out["Primary_fill_color_hex"].str.fullmatch(r"#[0-9A-Fa-f]{6}").all():
        raise ValueError("module_dictionary colors must be six-digit hexadecimal values")
    if order_col:
        out["Module_order"] = pd.to_numeric(df[order_col], errors="coerce").fillna(999).astype(int)
    else:
        out["Module_order"] = range(1, len(out) + 1)

    # Ensure Unclassified exists
    if MODULE_UNCLASSIFIED not in set(out["Module_ID"]):
        out = pd.concat([
            out,
            pd.DataFrame([{
                "Module_ID": MODULE_UNCLASSIFIED,
                "Module_name": MODULE_UNCLASSIFIED,
                "Primary_fill_color_hex": "#BDBDBD",
                "Module_order": 999,
            }])
        ], ignore_index=True)

    return out.reset_index(drop=True)


def load_term_map(path: Path, module_dict: pd.DataFrame) -> pd.DataFrame:
    df = read_table_auto(path)
    term_col = find_column(df, ["term_description", "description", "term", "pathway", "pathway_description"], required=True)
    module_col = find_column(df, ["Module_ID", "module", "module_id", "functional_module"], required=True)
    include_col = find_column(df, ["include", "use", "selected"], required=False)
    reason_col = find_column(df, ["mapping_reason", "reason", "note"], required=False)
    confidence_col = find_column(df, ["mapping_confidence", "confidence"], required=False)

    out = pd.DataFrame()
    out["term_description"] = clean_text(df[term_col])
    out["Module_ID"] = clean_text(df[module_col])
    out["include"] = df[include_col].map(yes_like) if include_col else True
    out["mapping_reason"] = clean_text(df[reason_col]) if reason_col else ""
    out["mapping_confidence"] = clean_text(df[confidence_col]) if confidence_col else ""
    out = out[out["include"]].copy()

    if out["term_description"].eq("").any() or out["Module_ID"].eq("").any():
        raise ValueError("included term_to_module_mapping rows require term_description and Module_ID")

    known_modules = set(module_dict["Module_ID"])
    unknown = sorted(set(out["Module_ID"]) - known_modules)
    if unknown:
        raise ValueError(
            "term_to_module_mapping contains Module_ID values not found in module_dictionary:\n"
            + "\n".join([f"  - {x}" for x in unknown])
        )

    return out.drop_duplicates(subset=["term_description", "Module_ID"]).reset_index(drop=True)


def load_manual_curation(path: Optional[Path], module_dict: pd.DataFrame) -> pd.DataFrame:
    if path is None:
        return pd.DataFrame(columns=[
            "Gene", "Primary_module_manual", "Functional_subtheme", "Bridge_annotation",
            "Evidence_basis", "Curation_confidence", "Curation_reason", "Use_in_main_network",
            "Display_color_override", "Show_label_manual"
        ])
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)

    df = read_table_auto(path)
    gene_col = find_column(df, ["Gene", "gene", "symbol"], required=True)
    module_col = find_column(df, ["Primary_module_manual", "primary_module", "Module_ID", "module"], required=False)

    out = pd.DataFrame()
    out["Gene"] = df[gene_col].map(normalize_gene)
    out["Primary_module_manual"] = clean_text(df[module_col]) if module_col else ""

    optional_cols = {
        "Functional_subtheme": ["Functional_subtheme", "subtheme"],
        "Bridge_annotation": ["Bridge_annotation", "bridge"],
        "Evidence_basis": ["Evidence_basis", "evidence_basis"],
        "Curation_confidence": ["Curation_confidence", "confidence"],
        "Curation_reason": ["Curation_reason", "reason", "note"],
        "Use_in_main_network": ["Use_in_main_network", "use_in_main_network", "use"],
        "Display_color_override": ["Display_color_override", "color_override"],
        "Show_label_manual": ["Show_label_manual", "show_label", "label"],
    }
    for out_col, candidates in optional_cols.items():
        c = find_column(df, candidates, required=False)
        out[out_col] = clean_text(df[c]) if c else ""

    out = out.dropna(subset=["Gene"]).reset_index(drop=True)
    if out["Gene"].duplicated().any():
        raise ValueError("manual_gene_curation contains duplicate Gene identifiers")

    known_modules = set(module_dict["Module_ID"])
    manual_modules = set(out["Primary_module_manual"]) - {""}
    unknown = sorted(manual_modules - known_modules)
    if unknown:
        raise ValueError(
            "manual_gene_curation contains Primary_module_manual values not found in module_dictionary:\n"
            + "\n".join([f"  - {x}" for x in unknown])
        )

    return out


def infer_source_label(path: Path, enrichment_source: str) -> str:
    name = path.name
    if enrichment_source == "ppi_string":
        if "Process" in name:
            return "GO_Process"
        if "KEGG" in name:
            return "KEGG"
        if "RCTM" in name:
            return "Reactome"
        if "WikiPathways" in name:
            return "WikiPathways"
    return path.stem


def extract_term_gene_records(enrichment_files: List[Path], term_map: pd.DataFrame, module_dict: pd.DataFrame, enrichment_source: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    term_map_lookup = term_map.merge(module_dict, on="Module_ID", how="left")
    selected_terms = set(term_map_lookup["term_description"])
    records = []
    unmatched_term_records = []

    for path in enrichment_files:
        df = read_table_auto(path)
        term_col = find_column(df, ["term_description", "description", "term", "pathway", "pathway_description"], required=True)
        genes_col = find_column(df, ["matching_genes", "matching gene", "matching proteins", "matching_proteins", "genes", "input_genes", "preferredNames"], required=True)
        source_label = infer_source_label(path, enrichment_source)

        for _, row in df.iterrows():
            term = str(row[term_col]).strip()
            if term not in selected_terms:
                unmatched_term_records.append({
                    "source_file": path.name,
                    "source_label": source_label,
                    "term_description": term,
                    "reason": "term not included in term_to_module_mapping or include != yes",
                })
                continue

            term_rows = term_map_lookup[term_map_lookup["term_description"] == term]
            raw_genes = split_genes(row[genes_col])
            for gene in raw_genes:
                for _, term_info in term_rows.iterrows():
                    records.append({
                        "Gene": gene,
                        "source_file": path.name,
                        "source_label": source_label,
                        "term_description": term,
                        "Module_ID": term_info["Module_ID"],
                        "Module_name": term_info["Module_name"],
                        "mapping_confidence": term_info.get("mapping_confidence", ""),
                        "mapping_reason": term_info.get("mapping_reason", ""),
                    })

    long_df = pd.DataFrame(records)
    if not long_df.empty:
        long_df = long_df.drop_duplicates().sort_values(["Module_ID", "Gene", "term_description"]).reset_index(drop=True)

    unmatched_df = pd.DataFrame(unmatched_term_records).drop_duplicates() if unmatched_term_records else pd.DataFrame(columns=["source_file", "source_label", "term_description", "reason"])
    return long_df, unmatched_df


def choose_primary_module_auto(freq_row: pd.Series, module_order: Dict[str, int]) -> str:
    candidates = []
    for module_id, count in freq_row.items():
        try:
            value = int(count)
        except Exception:
            value = 0
        if value > 0:
            candidates.append((module_id, value, module_order.get(module_id, 999)))
    if not candidates:
        return MODULE_UNCLASSIFIED
    candidates.sort(key=lambda x: (-x[1], x[2], x[0]))
    return candidates[0][0]


def build_module_matrices(node_base: pd.DataFrame, long_df: pd.DataFrame, module_dict: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    module_ids = [m for m in module_dict.sort_values("Module_order")["Module_ID"].tolist() if m != MODULE_UNCLASSIFIED]
    genes = node_base["Gene"].tolist()

    freq = pd.DataFrame({"Gene": genes})
    binary = pd.DataFrame({"Gene": genes})
    for module_id in module_ids:
        counts = long_df[long_df["Module_ID"] == module_id].groupby("Gene")["term_description"].nunique() if not long_df.empty else pd.Series(dtype=int)
        freq[module_id] = freq["Gene"].map(counts).fillna(0).astype(int)
        binary[module_id] = (freq[module_id] > 0).astype(int)

    if not long_df.empty:
        term_counts = long_df.groupby(["Gene", "term_description"]).size().reset_index(name="n")
        pathway = term_counts.pivot_table(index="Gene", columns="term_description", values="n", aggfunc="sum", fill_value=0)
        pathway = (pathway > 0).astype(int).reset_index()
        pathway = pd.DataFrame({"Gene": genes}).merge(pathway, on="Gene", how="left").fillna(0)
        for c in pathway.columns:
            if c != "Gene":
                pathway[c] = pathway[c].astype(int)
    else:
        pathway = pd.DataFrame({"Gene": genes})

    return binary, freq, pathway


def build_gene_summary(node_base: pd.DataFrame, long_df: pd.DataFrame, module_freq: pd.DataFrame, module_dict: pd.DataFrame, manual: pd.DataFrame) -> pd.DataFrame:
    module_order = dict(zip(module_dict["Module_ID"], module_dict["Module_order"]))
    module_name = dict(zip(module_dict["Module_ID"], module_dict["Module_name"]))
    module_color = dict(zip(module_dict["Module_ID"], module_dict["Primary_fill_color_hex"]))

    if not long_df.empty:
        evidence_summary = long_df.groupby("Gene").agg(
            Selected_terms=("term_description", lambda x: "; ".join(sorted(set(x)))),
            Term_count=("term_description", lambda x: len(set(x))),
            Functional_modules_raw=("Module_ID", lambda x: "; ".join(sorted(set(x), key=lambda z: module_order.get(z, 999)))),
            Functional_module_count=("Module_ID", lambda x: len(set(x))),
            Source_labels=("source_label", lambda x: "; ".join(sorted(set(x)))),
        ).reset_index()
    else:
        evidence_summary = pd.DataFrame(columns=["Gene", "Selected_terms", "Term_count", "Functional_modules_raw", "Functional_module_count", "Source_labels"])

    out = node_base.merge(evidence_summary, on="Gene", how="left")
    out["Selected_terms"] = out["Selected_terms"].fillna("")
    out["Term_count"] = out["Term_count"].fillna(0).astype(int)
    out["Functional_modules_raw"] = out["Functional_modules_raw"].fillna("")
    out["Functional_module_count"] = out["Functional_module_count"].fillna(0).astype(int)
    out["Source_labels"] = out["Source_labels"].fillna("")

    freq_cols = [c for c in module_freq.columns if c != "Gene"]
    freq_for_primary = module_freq.set_index("Gene")[freq_cols]
    primary_auto = []
    for gene in out["Gene"]:
        if gene in freq_for_primary.index:
            primary_auto.append(choose_primary_module_auto(freq_for_primary.loc[gene], module_order))
        else:
            primary_auto.append(MODULE_UNCLASSIFIED)
    out["Primary_module_auto"] = primary_auto

    if manual is not None and not manual.empty:
        out = out.merge(manual, on="Gene", how="left")
    else:
        for c in ["Primary_module_manual", "Functional_subtheme", "Bridge_annotation", "Evidence_basis", "Curation_confidence", "Curation_reason", "Use_in_main_network", "Display_color_override", "Show_label_manual"]:
            out[c] = ""

    for c in ["Primary_module_manual", "Functional_subtheme", "Bridge_annotation", "Evidence_basis", "Curation_confidence", "Curation_reason", "Use_in_main_network", "Display_color_override", "Show_label_manual"]:
        if c not in out.columns:
            out[c] = ""
        out[c] = out[c].fillna("").astype(str).replace("nan", "")

    out["Primary_module_final"] = out.apply(
        lambda row: row["Primary_module_manual"] if row["Primary_module_manual"] else row["Primary_module_auto"],
        axis=1,
    )
    out["Primary_module_final"] = out["Primary_module_final"].replace("", MODULE_UNCLASSIFIED).fillna(MODULE_UNCLASSIFIED)
    out["Module_name_final"] = out["Primary_module_final"].map(module_name).fillna(out["Primary_module_final"])
    out["Primary_fill_color_hex"] = out.apply(
        lambda row: row["Display_color_override"] if row["Display_color_override"] else module_color.get(row["Primary_module_final"], "#BDBDBD"),
        axis=1,
    )
    out["Manual_curation_applied"] = out["Primary_module_manual"].apply(lambda x: "yes" if str(x).strip() else "no")
    out["Core_gene"] = out.apply(lambda row: "yes" if row["Term_count"] >= 2 or row["Functional_module_count"] >= 2 or row["Manual_curation_applied"] == "yes" else "no", axis=1)
    out["Show_label"] = out.apply(
        lambda row: "yes" if row["Core_gene"] == "yes" or yes_like(row.get("Show_label_manual", "")) else "no",
        axis=1,
    )

    order_cols = [
        "Gene", "Primary_module_final", "Module_name_final", "Primary_fill_color_hex",
        "Primary_module_auto", "Primary_module_manual", "Manual_curation_applied",
        "Selected_terms", "Term_count", "Functional_modules_raw", "Functional_module_count", "Source_labels",
        "Functional_subtheme", "Bridge_annotation", "Evidence_basis", "Curation_confidence", "Curation_reason",
        "Core_gene", "Show_label", "Use_in_main_network", "Display_color_override",
    ]
    order_cols = [c for c in order_cols if c in out.columns]
    remaining = [c for c in out.columns if c not in order_cols]
    return out[order_cols + remaining]


def copy_used_tables(term_map: pd.DataFrame, module_dict: pd.DataFrame, manual: pd.DataFrame, args: argparse.Namespace, dirs: Dict[str, Path], enrichment_files: List[Path]) -> None:
    term_map.to_csv(dirs["reference_tables_used"] / "term_to_module_mapping_used.csv", index=False)
    module_dict.to_csv(dirs["reference_tables_used"] / "module_dictionary_used.csv", index=False)
    manual.to_csv(dirs["reference_tables_used"] / "manual_gene_curation_used.csv", index=False)

    manifest = pd.DataFrame([
        {"input_role": "node_table", "path": str(args.node_table), "mode": "all"},
        {"input_role": "term_map", "path": str(args.term_map), "mode": "all"},
        {"input_role": "module_dict", "path": str(args.module_dict), "mode": "all"},
        {"input_role": "manual_gene_curation", "path": str(args.manual_gene_curation or ""), "mode": "optional"},
        *[{"input_role": "enrichment_file", "path": str(p), "mode": args.enrichment_source} for p in enrichment_files],
    ])
    manifest.to_csv(dirs["reference_tables_used"] / "input_manifest_used.csv", index=False)


def write_metadata(args: argparse.Namespace, dirs: Dict[str, Path], enrichment_files: List[Path], output_files: List[Path]) -> None:
    meta = {
        "step": "02_build_annotation_evidence",
        "run_time": datetime.now().isoformat(timespec="seconds"),
        "enrichment_source": args.enrichment_source,
        "enrichment_files": [str(p) for p in enrichment_files],
        "node_table": str(args.node_table),
        "term_map": str(args.term_map),
        "module_dict": str(args.module_dict),
        "manual_gene_curation": str(args.manual_gene_curation or ""),
        "outdir": str(args.outdir),
    }
    (dirs["run_metadata"] / "run_metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    manifest = pd.DataFrame([
        {
            "step_id": "02",
            "step_name": "build_annotation_evidence",
            "output_folder": str(p.parent),
            "output_file": p.name,
            "description": "generated by build_annotation_evidence.py",
        }
        for p in output_files
    ])
    manifest.to_csv(dirs["run_metadata"] / "output_manifest_step02.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build gene-term-module evidence and first annotation tables.")
    parser.add_argument("--enrichment_source", choices=["ppi_string", "custom"], required=True)
    parser.add_argument("--ppi_enrichment_dir", default=None)
    parser.add_argument("--enrichment_files", nargs="*", default=[])
    parser.add_argument("--node_table", required=True)
    parser.add_argument("--term_map", required=True)
    parser.add_argument("--module_dict", required=True)
    parser.add_argument("--manual_gene_curation", default=None)
    parser.add_argument("--outdir", default="result")
    parser.add_argument("--interactive_confirm", action="store_true")
    args = parser.parse_args()

    dirs = make_result_dirs(Path(args.outdir))
    enrichment_files = resolve_enrichment_inputs(
        enrichment_source=args.enrichment_source,
        ppi_enrichment_dir=args.ppi_enrichment_dir,
        enrichment_files=args.enrichment_files,
        interactive_confirm=args.interactive_confirm,
    )

    node_base = load_node_table(Path(args.node_table))
    module_dict = load_module_dictionary(Path(args.module_dict))
    term_map = load_term_map(Path(args.term_map), module_dict)
    manual = load_manual_curation(Path(args.manual_gene_curation) if args.manual_gene_curation else None, module_dict)

    long_df, unmatched_terms = extract_term_gene_records(enrichment_files, term_map, module_dict, args.enrichment_source)
    if long_df.empty:
        raise ValueError(
            "No gene-term-module records were extracted. Check whether term_description values in enrichment files exactly match term_to_module_mapping."
        )

    # Keep the full source evidence, but make genes outside the node table visible.
    # Final annotations and matrices intentionally use only node-table genes.
    off_node = long_df[~long_df["Gene"].isin(set(node_base["Gene"]))].copy()
    off_node_columns = ["Gene", "source_file", "source_label", "term_description", "Module_ID"]
    off_node = off_node[off_node_columns].drop_duplicates() if not off_node.empty else pd.DataFrame(columns=off_node_columns)

    module_binary, module_freq, pathway_binary = build_module_matrices(node_base, long_df, module_dict)
    summary = build_gene_summary(node_base, long_df, module_freq, module_dict, manual)

    outputs = []
    p = dirs["evidence_mapping"] / "gene_term_module_long.csv"; long_df.to_csv(p, index=False); outputs.append(p)
    p = dirs["evidence_mapping"] / "gene_module_evidence_summary.csv"; summary.to_csv(p, index=False); outputs.append(p)
    p = dirs["evidence_mapping"] / "unmatched_enrichment_terms_report.csv"; unmatched_terms.to_csv(p, index=False); outputs.append(p)
    p = dirs["evidence_mapping"] / "enrichment_genes_not_in_node_table.csv"; off_node.to_csv(p, index=False); outputs.append(p)
    p = dirs["final_annotation_tables"] / "gene_module_classification_total.csv"; summary.to_csv(p, index=False); outputs.append(p)
    p = dirs["preliminary_matrices"] / "preliminary_gene_module_binary_matrix.csv"; module_binary.to_csv(p, index=False); outputs.append(p)
    p = dirs["preliminary_matrices"] / "preliminary_gene_module_frequency_matrix.csv"; module_freq.to_csv(p, index=False); outputs.append(p)
    p = dirs["preliminary_matrices"] / "preliminary_gene_pathway_binary_matrix.csv"; pathway_binary.to_csv(p, index=False); outputs.append(p)

    copy_used_tables(term_map, module_dict, manual, args, dirs, enrichment_files)
    write_metadata(args, dirs, enrichment_files, outputs)

    print("\nDone: Step 02 build_annotation_evidence")
    print(f"Genes/nodes: {len(node_base)}")
    print(f"Gene-term-module records: {len(long_df)}")
    print(f"Evidence records outside node table: {len(off_node)}")
    print(f"Output root: {Path(args.outdir).resolve()}")
    print("Primary module summary:")
    print(summary["Primary_module_final"].value_counts(dropna=False).to_string())


if __name__ == "__main__":
    main()
