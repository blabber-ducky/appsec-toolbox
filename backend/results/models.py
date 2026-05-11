from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Literal

SeverityLevel = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"]


@dataclass
class Finding:
    id: str
    tool: str
    scan_type: str
    severity: SeverityLevel
    title: str
    description: str
    location: str
    rule_id: str
    cve: str | None = None
    fix_version: str | None = None
    references: list[str] = field(default_factory=list)
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ColumnMeta:
    key: str
    label: str
    description: str
    default: bool
