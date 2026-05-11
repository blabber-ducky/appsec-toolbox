from __future__ import annotations
import asyncio
from dataclasses import dataclass, field, asdict
from typing import Literal

from results.models import Finding, ColumnMeta

ALL_COLUMNS: list[ColumnMeta] = [
    ColumnMeta("severity",    "Severity",    "Risk level: CRITICAL, HIGH, MEDIUM, LOW, or INFO",                          True),
    ColumnMeta("title",       "Title",       "Short name of the finding or vulnerability",                                 True),
    ColumnMeta("location",    "Location",    "File path + line number for code, or package@version for dependencies",      True),
    ColumnMeta("rule_id",     "Rule / Check","The rule ID, check name, or CVE identifier emitted by the scanner",          True),
    ColumnMeta("cve",         "CVE ID",      "CVE identifier — populated for SCA and Build scans only",                    True),
    ColumnMeta("fix_version", "Fix Version", "The dependency version that resolves this CVE",                              True),
    ColumnMeta("description", "Description", "Full explanation of the finding from the scanner",                            False),
    ColumnMeta("references",  "References",  "Advisory links, proof-of-concept URLs, and documentation",                   False),
    ColumnMeta("tool",        "Tool",        "Which scanner produced this finding",                                         False),
]


def available_columns(findings: list[Finding]) -> list[ColumnMeta]:
    """Return only columns that have a non-empty value in at least one finding."""
    populated: set[str] = set()
    for f in findings:
        d = asdict(f)
        for col in ALL_COLUMNS:
            val = d.get(col.key)
            if val not in (None, "", [], {}):
                populated.add(col.key)
    return [c for c in ALL_COLUMNS if c.key in populated]


@dataclass
class ScanState:
    scan_id: str
    session_id: str
    tool_id: str
    scan_type: str
    status: Literal["pending", "running", "complete", "failed"] = "pending"
    logs: list[dict] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    columns: list[ColumnMeta] = field(default_factory=list)
    error: str | None = None
    spdx_content: str | None = None


_store: dict[str, ScanState] = {}
_log_queues: dict[str, asyncio.Queue] = {}


def create_scan(scan_id: str, session_id: str, tool_id: str, scan_type: str) -> ScanState:
    state = ScanState(scan_id=scan_id, session_id=session_id, tool_id=tool_id, scan_type=scan_type)
    _store[scan_id] = state
    _log_queues[scan_id] = asyncio.Queue()
    return state


def get_scan(scan_id: str) -> ScanState | None:
    return _store.get(scan_id)


def log_message(scan_id: str, msg: dict) -> None:
    """Append a log message to state and push to the live WebSocket queue."""
    state = _store.get(scan_id)
    if state:
        state.logs.append(msg)
    q = _log_queues.get(scan_id)
    if q:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


def get_log_queue(scan_id: str) -> asyncio.Queue | None:
    return _log_queues.get(scan_id)


def purge_session(session_id: str) -> None:
    to_delete = [k for k, v in _store.items() if v.session_id == session_id]
    for scan_id in to_delete:
        _store.pop(scan_id, None)
        _log_queues.pop(scan_id, None)
