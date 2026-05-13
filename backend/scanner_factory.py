from __future__ import annotations
from pathlib import Path

import yaml

from scanners.base import BaseScanner
from scanners.sast.semgrep import SemgrepScanner
from scanners.sast.opengrep import OpenGrepScanner
from scanners.trivy import TrivyScanner
from scanners.sca.grype import GrypeScanner
from scanners.sca.syft import SyftScanner
from scanners.sca.owasp_dc import OWASPDCScanner
from scanners.iac.kics import KICSScanner
from scanners.iac.checkov import CheckovScanner
from scanners.secrets.gitleaks import GitleaksScanner
from scanners.secrets.trufflehog import TruffleHogScanner
from scanners.mobile.mobsfscan import MobSFScanScanner

_REGISTRY: dict[str, type[BaseScanner]] = {
    "semgrep": SemgrepScanner,
    "opengrep": OpenGrepScanner,
    "trivy": TrivyScanner,
    "grype": GrypeScanner,
    "syft": SyftScanner,
    "owasp-dc": OWASPDCScanner,
    "kics": KICSScanner,
    "checkov": CheckovScanner,
    "gitleaks": GitleaksScanner,
    "trufflehog": TruffleHogScanner,
    "mobsfscan": MobSFScanScanner,
}

_TOOLS_YAML = Path(__file__).parent / "config" / "tools.yaml"
_tool_configs: dict[str, dict] | None = None


def _load_configs() -> dict[str, dict]:
    global _tool_configs
    if _tool_configs is None:
        with open(_TOOLS_YAML) as f:
            data = yaml.safe_load(f)
        _tool_configs = {}
        for tools in data.get("tools", {}).values():
            for tool in tools:
                _tool_configs[tool["id"]] = tool
    return _tool_configs


def get_scanner(tool_id: str) -> BaseScanner:
    cls = _REGISTRY.get(tool_id)
    if not cls:
        raise ValueError(f"No scanner implementation for tool '{tool_id}'")
    config = _load_configs().get(tool_id)
    if not config:
        raise KeyError(f"Tool '{tool_id}' not found in tools.yaml")
    return cls(config)
