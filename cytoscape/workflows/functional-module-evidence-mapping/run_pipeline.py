#!/usr/bin/env python3
"""Run the synthetic example or a configured gene-to-module evidence workflow."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

from src.validate_enrichment_inputs import resolve_enrichment_inputs

ROOT = Path(__file__).resolve().parent


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_config(name: str) -> tuple[Path, dict[str, Any]]:
    path = Path(name).expanduser()
    if not path.is_absolute():
        path = (Path.cwd() / path) if path.exists() else (ROOT / path)
    path = path.resolve()
    if path.suffix.lower() != ".json":
        raise ValueError("The workflow uses JSON configuration; see config.example.json")
    config = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("The configuration must be a JSON object")
    return path, config


def resolve_path(value: str | None, base: Path, label: str) -> Path:
    if not value:
        raise ValueError(f"Missing {label} in configuration or command line")
    path = Path(value).expanduser()
    return (path if path.is_absolute() else base / path).resolve()


def selected(cli_value: Any, config: dict[str, Any], key: str, default: Any = None) -> Any:
    return cli_value if cli_value is not None else config.get(key, default)


def git_state() -> dict[str, Any]:
    try:
        revision = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=False,
        )
        dirty = subprocess.run(
            ["git", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=no"],
            capture_output=True, text=True, check=False,
        )
    except OSError:
        return {"commit": None, "tracked_files_modified": None}
    if revision.returncode != 0 or dirty.returncode != 0:
        return {"commit": None, "tracked_files_modified": None}
    return {"commit": revision.stdout.strip(), "tracked_files_modified": bool(dirty.stdout.strip())}


def run_step(name: str, command: list[str], status: dict[str, str]) -> None:
    print(f"\nRunning {name}", flush=True)
    try:
        subprocess.run(command, cwd=ROOT, check=True)
    except (OSError, subprocess.CalledProcessError):
        status[name] = "failed"
        raise
    status[name] = "completed"


def locate_rscript(name: str | None) -> str | None:
    if not name:
        return shutil.which("Rscript")
    path = Path(name).expanduser()
    if path.is_file():
        return str(path.resolve())
    executable = shutil.which(name)
    if executable:
        return executable
    raise FileNotFoundError(f"Rscript requested but not found: {name}")


def output_manifest(outdir: Path) -> list[dict[str, Any]]:
    files = []
    for path in sorted(p for p in outdir.rglob("*") if p.is_file()):
        if path.name in {"pipeline_run.json", "output_files.json"}:
            continue
        files.append({
            "path": path.relative_to(outdir).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="config.example.json", help="JSON file; relative inputs resolve from its directory")
    parser.add_argument("--enrichment-source", "--enrichment_source", choices=["ppi_string", "custom"])
    parser.add_argument("--ppi-enrichment-dir", "--ppi_enrichment_dir")
    parser.add_argument("--enrichment-files", "--enrichment_files", nargs="+")
    parser.add_argument("--node-table", "--node_table")
    parser.add_argument("--term-map", "--term_map")
    parser.add_argument("--module-dict", "--module_dict")
    parser.add_argument("--manual-gene-curation", "--manual_gene_curation")
    parser.add_argument("--outdir")
    parser.add_argument("--core-only", "--core_only", action="store_true")
    parser.add_argument("--exclude-unclassified", "--exclude_unclassified", action="store_true")
    parser.add_argument("--skip-heatmap", "--skip_heatmap", action="store_true")
    parser.add_argument("--skip-cytoscape-import", "--skip_cytoscape_import", action="store_true")
    parser.add_argument("--interactive-confirm", "--interactive_confirm", action="store_true")
    parser.add_argument("--rscript", help="Optional path to Rscript; auto-detected when omitted")
    args = parser.parse_args()

    config_path, config = load_config(args.config)
    base = config_path.parent
    source = selected(args.enrichment_source, config, "enrichment_source", "ppi_string")
    if source not in {"ppi_string", "custom"}:
        raise ValueError(f"Unsupported enrichment_source: {source}")
    node_table = resolve_path(selected(args.node_table, config, "node_table"), base, "node_table")
    term_map = resolve_path(selected(args.term_map, config, "term_map"), base, "term_map")
    module_dict = resolve_path(selected(args.module_dict, config, "module_dict"), base, "module_dict")
    manual_value = selected(args.manual_gene_curation, config, "manual_gene_curation")
    manual = resolve_path(manual_value, base, "manual_gene_curation") if manual_value else None
    outdir = resolve_path(selected(args.outdir, config, "outdir", "results/example"), base, "outdir")
    core_only = args.core_only or bool(config.get("core_only", False))
    exclude_unclassified = args.exclude_unclassified or bool(config.get("exclude_unclassified", False))
    plot_heatmaps = not args.skip_heatmap and bool(config.get("plot_heatmaps", True))
    build_import = not args.skip_cytoscape_import and bool(config.get("build_cytoscape_import", True))

    ppi_dir = None
    custom_files: list[Path] = []
    if source == "ppi_string":
        ppi_dir = resolve_path(selected(args.ppi_enrichment_dir, config, "ppi_enrichment_dir"), base, "ppi_enrichment_dir")
    else:
        values = selected(args.enrichment_files, config, "custom_enrichment_files", [])
        custom_files = [resolve_path(value, base, "enrichment_file") for value in values]
    enrichment_files = resolve_enrichment_inputs(
        source,
        str(ppi_dir) if ppi_dir else None,
        [str(path) for path in custom_files],
        args.interactive_confirm,
    )
    inputs = [node_table, term_map, module_dict, *([manual] if manual else []), *enrichment_files]
    for path in inputs:
        if not path.is_file():
            raise FileNotFoundError(path)
    if outdir.exists() and any(outdir.iterdir()):
        raise FileExistsError(f"Output directory is not empty; choose a fresh --outdir: {outdir}")
    outdir.mkdir(parents=True, exist_ok=True)
    metadata_dir = outdir / "06_run_metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)

    statuses: dict[str, str] = {}
    metadata: dict[str, Any] = {
        "workflow_version": "0.1.0",
        "project_name": config.get("project_name", ""),
        "started_utc": timestamp(),
        "status": "running",
        "config": {"path": str(config_path), "sha256": sha256(config_path)},
        "inputs": [{"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)} for path in inputs],
        "parameters": {
            "enrichment_source": source,
            "core_only": core_only,
            "exclude_unclassified": exclude_unclassified,
            "plot_heatmaps": plot_heatmaps,
            "build_cytoscape_import": build_import,
        },
        "environment": {
            "python": platform.python_version(),
            "pandas": version("pandas"),
            "platform": platform.platform(),
            "git": git_state(),
        },
        "random_seed": None,
        "output_dir": str(outdir),
        "steps": statuses,
    }

    try:
        step02 = [
            sys.executable, str(ROOT / "src/build_annotation_evidence.py"),
            "--enrichment_source", source,
            "--node_table", str(node_table),
            "--term_map", str(term_map),
            "--module_dict", str(module_dict),
            "--outdir", str(outdir),
        ]
        if manual:
            step02 += ["--manual_gene_curation", str(manual)]
        if ppi_dir:
            step02 += ["--ppi_enrichment_dir", str(ppi_dir)]
        else:
            step02 += ["--enrichment_files", *[str(path) for path in custom_files]]
        run_step("annotation_evidence", step02, statuses)

        step03 = [sys.executable, str(ROOT / "src/finalize_heatmap_matrices.py"), "--outdir", str(outdir)]
        if core_only:
            step03.append("--core_only")
        if exclude_unclassified:
            step03.append("--exclude_unclassified")
        run_step("final_heatmap_matrices", step03, statuses)

        if plot_heatmaps:
            rscript = locate_rscript(args.rscript or config.get("rscript"))
            if rscript:
                metadata["environment"]["rscript"] = rscript
                run_step("heatmap_figures", [
                    rscript, str(ROOT / "src/plot_gene_module_heatmap.R"),
                    "--input", str(outdir / "02_final_heatmap_matrices/gene_module_frequency_matrix.csv"),
                    "--output_dir", str(outdir / "03_heatmap_figures"),
                ], statuses)
            else:
                statuses["heatmap_figures"] = "skipped: Rscript unavailable"
                print("Rscript unavailable; heatmap figure generation skipped.", flush=True)
        else:
            statuses["heatmap_figures"] = "skipped by configuration"

        if build_import:
            run_step("cytoscape_import", [
                sys.executable, str(ROOT / "src/build_cytoscape_import.py"), "--outdir", str(outdir),
            ], statuses)
        else:
            statuses["cytoscape_import"] = "skipped by configuration"
        metadata["status"] = "completed"
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        metadata["status"] = "failed"
        metadata["error"] = str(exc)
        raise
    finally:
        metadata["finished_utc"] = timestamp()
        (metadata_dir / "output_files.json").write_text(
            json.dumps(output_manifest(outdir), indent=2), encoding="utf-8"
        )
        (metadata_dir / "pipeline_run.json").write_text(
            json.dumps(metadata, indent=2), encoding="utf-8"
        )

    print(f"\nWorkflow completed: {outdir}")


if __name__ == "__main__":
    main()
