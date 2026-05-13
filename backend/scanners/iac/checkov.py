from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_checkov

logger = logging.getLogger(__name__)


class CheckovScanner(BaseScanner):
    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._scan_mode = "IaC"

    @property
    def entrypoint(self) -> list:
        return ["sh", "-c"]

    def prepare(self, workspace, scan_type=None, **kwargs) -> tuple[dict, str]:
        mode = (scan_type or "IaC").strip()
        self._scan_mode = mode
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        extra = "--enable-secret-scan-all-files" if mode == "Secrets" else ""
        command = (
            f"checkov -d /src -o json --compact --quiet {extra} "
            "> /out/results.json 2>/dev/null; exit 0"
        ).strip()
        logger.info("CheckovScanner mode=%s", mode)
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        text = out.read_text().strip()
        if not text:
            return []
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return []
        label = "Secrets" if self._scan_mode == "Secrets" else "IaC"
        return normalize_checkov(data, tool_id=self.config["id"], scan_type_label=label)
