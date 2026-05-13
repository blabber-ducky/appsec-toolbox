from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import (
    normalize_trivy_fs,
    normalize_trivy_iac,
    normalize_trivy_secrets,
)

logger = logging.getLogger(__name__)

_SCAN_MODES = {"SCA", "IaC", "Build", "Secrets"}


class TrivyScanner(BaseScanner):
    def __init__(self, config: dict) -> None:
        super().__init__(config)
        self._scan_mode = "SCA"
        self._input_type = "zip"

    @property
    def supports_spdx(self) -> bool:
        return self._scan_mode in ("SCA", "Build")

    def prepare(self, workspace, input_type="zip", image_ref=None, scan_type=None, **kwargs) -> tuple[dict, str]:
        mode = (scan_type or "SCA").strip()
        self._scan_mode = mode
        self._input_type = input_type

        if mode == "SCA":
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "fs --format json --output /out/results.json /src"

        elif mode == "IaC":
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "config --format json --output /out/results.json /src"

        elif mode == "Build":
            volumes = {
                str(workspace.input): {"bind": "/input", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "image --format json --input /input/image.tar.gz --output /out/results.json"

        elif mode == "Secrets":
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "fs --scanners secret --format json --output /out/results.json /src"

        else:
            logger.warning("Unknown scan_type '%s' for Trivy; defaulting to SCA", mode)
            self._scan_mode = "SCA"
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            command = "fs --format json --output /out/results.json /src"

        logger.info("TrivyScanner mode=%s command=%r", self._scan_mode, command)
        return volumes, command

    def prepare_spdx(self, workspace) -> tuple[str, dict] | None:
        if self._scan_mode == "SCA":
            command = "fs --format spdx-json --output /out/sbom.spdx.json /src"
            volumes = {
                str(workspace.src): {"bind": "/src", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            return command, volumes
        if self._scan_mode == "Build":
            command = "image --format spdx-json --input /input/image.tar.gz --output /out/sbom.spdx.json"
            volumes = {
                str(workspace.input): {"bind": "/input", "mode": "ro"},
                str(workspace.out): {"bind": "/out", "mode": "rw"},
            }
            return command, volumes
        return None

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            logger.info("Trivy output file not found — no findings")
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to parse Trivy JSON: %s", exc)
            return []

        tool_id = self.config["id"]
        if self._scan_mode == "Build":
            return normalize_trivy_fs(data, tool_id=tool_id, scan_type_label="Build")
        if self._scan_mode == "IaC":
            return normalize_trivy_iac(data, tool_id=tool_id)
        if self._scan_mode == "Secrets":
            return normalize_trivy_secrets(data, tool_id=tool_id)
        return normalize_trivy_fs(data, tool_id=tool_id, scan_type_label="SCA")
