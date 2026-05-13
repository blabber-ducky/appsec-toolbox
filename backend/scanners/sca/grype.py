from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_grype

logger = logging.getLogger(__name__)


class GrypeScanner(BaseScanner):
    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._scan_mode = "SCA"

    def prepare(self, workspace, input_type="zip", scan_type=None, **kwargs) -> tuple[dict, str]:
        mode = (scan_type or "SCA").strip()
        self._scan_mode = mode

        if mode == "Build":
            volumes = {
                str(workspace.input): {"bind": "/input", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "docker-archive:/input/image.tar.gz -o json --file /out/results.json"
        else:
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "dir:/src -o json --file /out/results.json"

        logger.info("GrypeScanner mode=%s command=%r", mode, command)
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        findings = normalize_grype(data, tool_id=self.config["id"])
        if self._scan_mode == "Build":
            for f in findings:
                f.scan_type = "Build"
        return findings
