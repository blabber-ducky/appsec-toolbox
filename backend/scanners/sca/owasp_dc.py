from __future__ import annotations
import json
import os
from pathlib import Path

from scanners.base import BaseScanner
from core.workspace import Workspace
from results.models import Finding
from results.normalizers import normalize_owasp_dc

# Persists NVD data across scans for the lifetime of the app container.
NVD_CACHE_DIR = "/tmp/appsec-nvd-cache"


class OWASPDCScanner(BaseScanner):
    def prepare(self, workspace: Workspace, **kwargs) -> tuple[dict, str]:
        os.makedirs(NVD_CACHE_DIR, exist_ok=True)
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
            NVD_CACHE_DIR: {"bind": "/usr/share/dependency-check/data", "mode": "rw"},
        }
        command = "--scan /src --format JSON --out /out --project appsec-scan"
        return volumes, command

    def parse_output(self, out_dir: str) -> list[Finding]:
        # OWASP DC writes dependency-check-report.json
        out = Path(out_dir) / "dependency-check-report.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        return normalize_owasp_dc(data)
