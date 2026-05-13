from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_semgrep

logger = logging.getLogger(__name__)


class SemgrepScanner(BaseScanner):
    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._scan_mode = "SAST"

    def prepare(self, workspace, scan_type=None, **kwargs) -> tuple[dict, str]:
        mode = (scan_type or "SAST").strip()
        self._scan_mode = mode
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        config_flag = "p/secrets" if mode == "Secrets" else "auto"
        command = f"semgrep scan --json --output /out/results.json --config {config_flag} /src"
        logger.info("SemgrepScanner mode=%s config=%s", mode, config_flag)
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        findings = normalize_semgrep(data, tool_id=self.config["id"])
        if self._scan_mode == "Secrets":
            for f in findings:
                f.scan_type = "Secrets"
        return findings
