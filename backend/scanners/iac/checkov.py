from __future__ import annotations
import json
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_checkov


class CheckovScanner(BaseScanner):
    @property
    def entrypoint(self) -> list:
        return ["sh", "-c"]

    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        # Redirect JSON output to file; suppress stderr noise; always exit 0
        # so the container exit code doesn't mask actual parse failures.
        command = "checkov -d /src -o json --compact --quiet > /out/results.json 2>/dev/null; exit 0"
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
        return normalize_checkov(data, tool_id=self.config["id"])
