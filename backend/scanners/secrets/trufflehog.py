from __future__ import annotations
import json
import logging
from pathlib import Path

from scanners.base import BaseScanner
from results.normalizers import normalize_trufflehog

logger = logging.getLogger(__name__)


class TruffleHogScanner(BaseScanner):
    @property
    def entrypoint(self) -> list:
        return ["sh", "-c"]

    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        # --json outputs NDJSON to stdout; redirect to file.
        # --no-update skips detector version checks (faster, works offline).
        # exit 0 prevents non-zero exit codes from triggering scan warnings.
        command = (
            "trufflehog filesystem /src --json --no-update "
            "> /out/results.json 2>/dev/null; exit 0"
        )
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        items = []
        for line in out.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError as exc:
                logger.debug("Skipping non-JSON TruffleHog line: %s", exc)
        return normalize_trufflehog(items, tool_id=self.config["id"])
