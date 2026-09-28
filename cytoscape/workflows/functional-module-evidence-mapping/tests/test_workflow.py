"""Integration checks for the bundled synthetic examples."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as stream:
        return list(csv.DictReader(stream))


class WorkflowExamplesTest(unittest.TestCase):
    def test_both_input_modes_and_standalone_export(self) -> None:
        with tempfile.TemporaryDirectory(prefix="cytoscape-workflow-test-") as temp:
            for mode in ("ppi_string", "custom"):
                with self.subTest(mode=mode):
                    result = Path(temp) / mode
                    command = [
                        sys.executable, str(ROOT / "run_pipeline.py"),
                        "--enrichment-source", mode,
                        "--outdir", str(result),
                        "--skip-heatmap",
                    ]
                    run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
                    self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

                    annotation = result / "01_annotation_evidence/final_annotation_tables/gene_module_classification_total.csv"
                    nodes = read_rows(annotation)
                    self.assertEqual(len(nodes), 6)
                    by_gene = {row["Gene"]: row for row in nodes}
                    self.assertEqual(by_gene["GENE_A"]["Primary_module_manual"], "")
                    self.assertEqual(by_gene["GENE_A"]["Manual_curation_applied"], "no")
                    self.assertEqual(by_gene["GENE_B"]["Primary_module_final"], "M2")
                    self.assertEqual(by_gene["GENE_B"]["Manual_curation_applied"], "yes")

                    self.assertTrue((result / "02_final_heatmap_matrices/gene_module_frequency_matrix.csv").is_file())
                    self.assertEqual(len(read_rows(result / "01_annotation_evidence/evidence_mapping/enrichment_genes_not_in_node_table.csv")), 0)
                    self.assertTrue((result / "04_cytoscape_import/cytoscape_node_import.csv").is_file())
                    metadata = json.loads((result / "06_run_metadata/pipeline_run.json").read_text(encoding="utf-8"))
                    self.assertEqual(metadata["status"], "completed")
                    self.assertEqual(metadata["steps"]["heatmap_figures"], "skipped by configuration")
                    self.assertTrue(all(entry["sha256"] for entry in metadata["inputs"]))

                    standalone = Path(temp) / f"{mode}_standalone"
                    export = subprocess.run([
                        sys.executable, str(ROOT / "src/build_cytoscape_import.py"),
                        "--classification-table", str(annotation),
                        "--output-dir", str(standalone),
                    ], cwd=ROOT, capture_output=True, text=True)
                    self.assertEqual(export.returncode, 0, export.stdout + export.stderr)
                    self.assertEqual(len(read_rows(standalone / "cytoscape_node_import.csv")), 6)

    def test_enrichment_gene_outside_node_table_is_reported(self) -> None:
        with tempfile.TemporaryDirectory(prefix="cytoscape-off-node-test-") as temp:
            extra_enrichment = Path(temp) / "extra.tsv"
            original = (ROOT / "examples/custom/enrichment_custom_example.tsv").read_text(encoding="utf-8")
            extra_enrichment.write_text(
                original + "Example inflammatory response process\tGENE_Z\t0.01\tcustom\n",
                encoding="utf-8",
            )
            result = Path(temp) / "result"
            run = subprocess.run([
                sys.executable, str(ROOT / "run_pipeline.py"),
                "--enrichment-source", "custom",
                "--enrichment-files", str(extra_enrichment),
                "--outdir", str(result),
                "--skip-heatmap",
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            off_node = read_rows(result / "01_annotation_evidence/evidence_mapping/enrichment_genes_not_in_node_table.csv")
            self.assertEqual({row["Gene"] for row in off_node}, {"GENE_Z"})
            final_nodes = read_rows(result / "01_annotation_evidence/final_annotation_tables/gene_module_classification_total.csv")
            self.assertNotIn("GENE_Z", {row["Gene"] for row in final_nodes})


if __name__ == "__main__":
    unittest.main()
