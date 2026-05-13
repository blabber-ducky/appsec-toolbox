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


def normalize_trivy_fs(
    data: dict,
    tool_id: str = "trivy",
    scan_type_label: str = "SCA",
) -> list[Finding]:
    findings: list[Finding] = []
    for result in data.get("Results", []):
        for vuln in result.get("Vulnerabilities") or []:
            pkg = vuln.get("PkgName", "")
            version = vuln.get("InstalledVersion", "")
            vid = vuln.get("VulnerabilityID", "")
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type=scan_type_label,
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


def normalize_trivy_image(data: dict, tool_id: str = "trivy") -> list[Finding]:
    return normalize_trivy_fs(data, tool_id=tool_id, scan_type_label="Build")


def normalize_trivy_iac(data: dict, tool_id: str = "trivy") -> list[Finding]:
    findings: list[Finding] = []
    for result in data.get("Results", []):
        target = result.get("Target", "?")
        for misc in result.get("Misconfigurations") or []:
            refs = list(misc.get("References", []))
            if misc.get("PrimaryURL"):
                refs = [misc["PrimaryURL"]] + refs
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="IaC",
                severity=_sev(misc.get("Severity", "unknown")),
                title=misc.get("Title", misc.get("ID", "Unknown misconfiguration")),
                description=misc.get("Description", misc.get("Message", "")),
                location=target,
                rule_id=misc.get("ID", misc.get("AVDID", "")),
                references=refs[:3],
                raw=misc,
            ))
    return findings


def normalize_trivy_secrets(data: dict, tool_id: str = "trivy") -> list[Finding]:
    findings: list[Finding] = []
    for result in data.get("Results", []):
        target = result.get("Target", "?")
        for secret in result.get("Secrets") or []:
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="Secrets",
                severity=_sev(secret.get("Severity", "high")),
                title=secret.get("Title", secret.get("RuleID", "Secret detected")),
                description=f"Category: {secret.get('Category', '?')}",
                location=f"{target}:{secret.get('StartLine', '?')}",
                rule_id=secret.get("RuleID", ""),
                references=[],
                raw=secret,
            ))
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


def normalize_gitleaks(data: list, tool_id: str = "gitleaks") -> list[Finding]:
    findings: list[Finding] = []
    for item in data:
        rule_id = item.get("RuleID", "")
        rule_lower = rule_id.lower()
        if any(p in rule_lower for p in ("private-key", "private_key", "secret-key", "secret_key")):
            sev: SeverityLevel = "CRITICAL"
        else:
            sev = "HIGH"
        desc = item.get("Description", rule_id or "Secret detected")
        match_fragment = item.get("Match", "")
        full_desc = desc
        if match_fragment:
            full_desc = f"{desc} — matched: {match_fragment[:80]}"
        findings.append(Finding(
            id=_fid(),
            tool=tool_id,
            scan_type="Secrets",
            severity=sev,
            title=desc[:120],
            description=full_desc,
            location=f"{item.get('File', '?')}:{item.get('StartLine', '?')}",
            rule_id=rule_id,
            references=[],
            raw=item,
        ))
    return findings


def normalize_opengrep(data: dict, tool_id: str = "opengrep") -> list[Finding]:
    return normalize_semgrep(data, tool_id=tool_id)


def normalize_grype(data: dict, tool_id: str = "grype") -> list[Finding]:
    findings: list[Finding] = []
    for match in data.get("matches", []):
        vuln = match.get("vulnerability", {})
        artifact = match.get("artifact", {})
        vid = vuln.get("id", "")
        pkg = artifact.get("name", "")
        version = artifact.get("version", "")
        fix_versions = vuln.get("fix", {}).get("versions", [])
        refs = vuln.get("urls", [])
        findings.append(Finding(
            id=_fid(),
            tool=tool_id,
            scan_type="SCA",
            severity=_sev(vuln.get("severity", "unknown")),
            title=vuln.get("description", vid)[:120] if vuln.get("description") else vid,
            description=vuln.get("description", ""),
            location=f"{pkg}@{version}" if pkg else "?",
            rule_id=vid,
            cve=vid if vid.startswith("CVE-") else None,
            fix_version=fix_versions[0] if fix_versions else None,
            references=refs,
            raw=match,
        ))
    return findings


def normalize_syft(data: dict, tool_id: str = "syft") -> list[Finding]:
    findings: list[Finding] = []
    for artifact in data.get("artifacts", []):
        name = artifact.get("name", "")
        version = artifact.get("version", "")
        pkg_type = artifact.get("type", "")
        language = artifact.get("language", "")
        purl = artifact.get("purl", "")
        licenses = artifact.get("licenses", [])
        license_names = [
            lic.get("value", lic) if isinstance(lic, dict) else lic
            for lic in licenses
        ]
        locations = artifact.get("locations", [])
        loc = locations[0].get("path", "?") if locations else "?"
        desc_parts = [f"{pkg_type} package"]
        if language:
            desc_parts.append(f"language: {language}")
        if license_names:
            desc_parts.append(f"license: {', '.join(license_names)}")
        if purl:
            desc_parts.append(f"purl: {purl}")
        findings.append(Finding(
            id=_fid(),
            tool=tool_id,
            scan_type="SCA",
            severity="INFO",
            title=f"{name}@{version}" if version else name,
            description=", ".join(desc_parts),
            location=loc,
            rule_id=purl,
            references=[],
            raw=artifact,
        ))
    return findings


def normalize_checkov(data, tool_id: str = "checkov", scan_type_label: str = "IaC") -> list[Finding]:
    entries = data if isinstance(data, list) else [data]
    findings: list[Finding] = []
    for entry in entries:
        results = entry.get("results", entry)
        for check in results.get("failed_checks", []):
            raw_sev = check.get("severity")
            sev = _sev(raw_sev) if raw_sev else "MEDIUM"
            refs = [check["guideline"]] if check.get("guideline") else []
            loc = check.get("file_path", "?")
            line_range = check.get("file_line_range", [])
            if line_range:
                loc = f"{loc}:{line_range[0]}"
            resource = check.get("resource", "")
            check_type = check.get("check_type", "")
            desc = f"Resource: {resource}" if resource else ""
            if check_type:
                desc = f"{desc}\nFramework: {check_type}".strip("\n")
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type=scan_type_label,
                severity=sev,
                title=check.get("check_name", check.get("check_id", "Unknown check")),
                description=desc,
                location=loc,
                rule_id=check.get("check_id", ""),
                references=refs,
                raw=check,
            ))
    return findings


def normalize_trufflehog(data: list, tool_id: str = "trufflehog") -> list[Finding]:
    findings: list[Finding] = []
    for item in data:
        detector = item.get("DetectorName", "Unknown")
        verified = item.get("Verified", False)
        sev: SeverityLevel = "CRITICAL" if verified else "HIGH"
        source_meta = item.get("SourceMetadata", {}).get("Data", {})
        file_info = (
            source_meta.get("Filesystem")
            or source_meta.get("Git")
            or {}
        )
        file_path = file_info.get("file", file_info.get("File", "?"))
        line = file_info.get("line", file_info.get("Line", "?"))
        raw_val = item.get("Raw", "")
        preview = (raw_val[:8] + "…" + raw_val[-4:]) if len(raw_val) > 16 else raw_val
        verified_label = " (verified live)" if verified else " (unverified)"
        findings.append(Finding(
            id=_fid(),
            tool=tool_id,
            scan_type="Secrets",
            severity=sev,
            title=f"{detector} credential detected{verified_label}",
            description=(
                f"Detector: {detector}. "
                f"{'Secret is verified active.' if verified else 'Unverified — may be a test or revoked credential.'}"
                f" Match preview: {preview}"
            ),
            location=f"{file_path}:{line}",
            rule_id=str(item.get("DetectorType", "")),
            references=[],
            raw=item,
        ))
    return findings


def normalize_mobsfscan(data: dict, tool_id: str = "mobsfscan") -> list[Finding]:
    findings: list[Finding] = []
    for item in data.get("results", {}).get("findings", []):
        rule_id = item.get("rule_id", "")
        title = item.get("title", rule_id or "Unknown finding")
        desc = item.get("description", "")
        refs = [item["ref"]] if item.get("ref") else []
        for file_detail in item.get("file_details", [{}]):
            file_path = file_detail.get("file_path", "?")
            match_lines = file_detail.get("match_lines", [0])
            line = match_lines[0] if match_lines else "?"
            findings.append(Finding(
                id=_fid(),
                tool=tool_id,
                scan_type="Mobile",
                severity=_sev(item.get("severity", "info")),
                title=title,
                description=desc,
                location=f"{file_path}:{line}",
                rule_id=rule_id,
                references=refs,
                raw={**item, "_file": file_detail},
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
