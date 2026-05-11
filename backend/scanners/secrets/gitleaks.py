from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_gitleaks

logger = logging.getLogger(__name__)


class GitleaksScanner(BaseScanner):
    @property
    def tool_id(self) -> str:
        return self.config["id"]

    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        command = (
            "detect --source /src "
            "--report-format json "
            "--report-path /out/results.json "
            "--no-git"
        )
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        result_path = Path(out_dir) / "results.json"
        if not result_path.exists():
            logger.info("Gitleaks output file not found — assuming no findings")
            return []
        text = result_path.read_text().strip()
        if not text or text == "null":
            logger.info("Gitleaks produced no findings (null output)")
            return []
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Gitleaks JSON output: %s", exc)
            raise RuntimeError(f"Gitleaks output is not valid JSON: {exc}") from exc
        return normalize_gitleaks(data, tool_id=self.tool_id)
