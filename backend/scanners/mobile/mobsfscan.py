from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_mobsfscan

logger = logging.getLogger(__name__)


class MobSFScanScanner(BaseScanner):
    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        command = "mobsfscan --json -o /out/results.json /src"
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            logger.info("mobsfscan output not found — assuming no findings")
            return []
        text = out.read_text().strip()
        if not text:
            return []
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse mobsfscan JSON output: %s", exc)
            raise RuntimeError(f"mobsfscan output is not valid JSON: {exc}") from exc
        return normalize_mobsfscan(data, tool_id=self.config["id"])
