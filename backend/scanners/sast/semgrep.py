from __future__ import annotations
import json
from pathlib import Path

from scanners.base import BaseScanner
from core.workspace import Workspace
from results.models import Finding
from results.normalizers import normalize_semgrep


class SemgrepScanner(BaseScanner):
    def prepare(self, workspace: Workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        command = "semgrep scan --json --output /out/results.json --config auto /src"
        return volumes, command

    def parse_output(self, out_dir: str) -> list[Finding]:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        return normalize_semgrep(data)
