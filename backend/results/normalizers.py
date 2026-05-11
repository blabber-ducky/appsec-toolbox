from __future__ import annotations
import uuid
from typing import Literal

from results.models import Finding, SeverityLevel

_SEVERITY_MAP: dict[str, SeverityLevel] = {
    "critical": "CRITICAL",
    "high": "HIGH",
    "error": "HIGH",
    "medium": "MEDIUM",
    "warning": "MEDIUM",
    "moderate": "MEDIUM",
    "low": "LOW",
    "info": "INFO",
    "informational": "INFO",
    "note": "INFO",
    "unknown": "UNKNOWN",
}


def _sev(raw: str) -> SeverityLevel:
    return _SEVERITY_MAP.get(raw.strip().lower(), "UNKNOWN")


def _fid() -> str:
    return str(uuid.uuid4())


def normalize_semgrep(data: dict, tool_id: str = "semgrep") -> list[Finding]:
    findings: list[Finding] = []
    for r in data.get("results", []):
        extra = r.get("extra", {})
        meta = extra.get("metadata", {})
        refs = meta.get("references", [])
        if isinstance(refs, str):
            refs = [refs]
        msg = extra.get("message", r.get("check_id", "Unknown finding"))
        findings.append(Finding(
            id=_fid(),
            tool=tool_id,
            scan_type="SAST",
            severity=_sev(extra.get("severity", "info")),
            title=msg[:120],
            description=msg,
            location=f"{r.get('path', '?')}:{r.get('start', {}).get('line', '?')}",
            rule_id=r.get("check_id", ""),
            references=refs,
            raw=r,
        ))
    return findings


def normalize_trivy_fs(data: dict, tool_id: str = "trivy-sca") -> list[Finding]:
    findings: list[Finding] = []
    for result in data.get("Results", []):
        for vuln in result.get("Vulnerabilities") or []:
            pkg = vuln.get("PkgName", "")
            version = vuln.get("InstalledVersion", "")
            vid = vuln.get("VulnerabilityID", "")
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="SCA",
                severity=_sev(vuln.get("Severity", "unknown")),
                title=vuln.get("Title") or vid or "Unknown vulnerability",
                description=vuln.get("Description", ""),
                location=f"{pkg}@{version}" if pkg else result.get("Target", "?"),
                rule_id=vid,
                cve=vid if vid.startswith("CVE-") else None,
                fix_version=vuln.get("FixedVersion") or None,
                references=vuln.get("References") or [],
                raw=vuln,
            ))
    return findings


def normalize_trivy_image(data: dict, tool_id: str = "trivy-image") -> list[Finding]:
    findings = normalize_trivy_fs(data, tool_id=tool_id)
    for f in findings:
        f.scan_type = "Build"
    return findings


def normalize_owasp_dc(data: dict, tool_id: str = "owasp-dc") -> list[Finding]:
    findings: list[Finding] = []
    for dep in data.get("dependencies", []):
        file_name = dep.get("fileName", "unknown")
        for vuln in dep.get("vulnerabilities", []):
            refs = [r.get("url", "") for r in vuln.get("references", []) if r.get("url")]
            cve_name = vuln.get("name", "")
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="SCA",
                severity=_sev(vuln.get("severity", "unknown")),
                title=vuln.get("name", "Unknown vulnerability"),
                description=vuln.get("description", ""),
                location=file_name,
                rule_id=cve_name,
                cve=cve_name if cve_name.startswith("CVE-") else None,
                references=refs,
                raw=vuln,
            ))
    return findings


def normalize_kics(data: dict, tool_id: str = "kics") -> list[Finding]:
    findings: list[Finding] = []
    for query in data.get("queries", []):
        for file_info in query.get("files", []):
            refs = [query["url"]] if query.get("url") else []
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="IaC",
                severity=_sev(query.get("severity", "info")),
                title=query.get("query_name", "Unknown check"),
                description=query.get("description", ""),
                location=f"{file_info.get('file_name', '?')}:{file_info.get('line', '?')}",
                rule_id=query.get("query_id", ""),
                references=refs,
                raw={**query, "_file": file_info},
            ))
    return findings
