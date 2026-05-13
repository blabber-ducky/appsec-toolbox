from __future__ import annotations
import json
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_syft


class SyftScanner(BaseScanner):
    @property
    def supports_spdx(self) -> bool:
        return True

    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        command = "scan /src -o json=/out/results.json"
        return volumes, command

    def prepare_spdx(self, workspace) -> tuple[str, dict] | None:
        command = "scan /src -o spdx-json=/out/sbom.spdx.json"
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        return command, volumes

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        return normalize_syft(data, tool_id=self.config["id"])
