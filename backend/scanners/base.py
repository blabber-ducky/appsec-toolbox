from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from core.workspace import Workspace
    from results.models import Finding


class BaseScanner(ABC):
    def __init__(self, config: dict):
        self.config = config

    @property
    def image(self) -> str:
        return self.config["image"]

    @property
    def supports_spdx(self) -> bool:
        return self.config.get("supports_spdx", False)

    @property
    def network_mode(self) -> str:
        # Override in scanners that must fetch rules/data at scan time.
        return "none"

    @abstractmethod
    def prepare(self, workspace: "Workspace", **kwargs) -> tuple[dict, str]:
        """Return (volumes_dict, command_string) for docker run."""

    @abstractmethod
    def parse_output(self, out_dir: str) -> list["Finding"]:
        """Parse scanner output from out_dir into normalized findings."""

    def prepare_spdx(self, workspace: "Workspace") -> tuple[str, dict] | None:
        """Return (command, volumes) for SPDX generation, or None if not supported."""
        return None
