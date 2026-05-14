# Normalizer Reference

All normalizer functions live in `backend/results/normalizers.py`. Their job is to convert a tool's native JSON output into a list of `Finding` objects with a consistent schema.

---

## Severity Mapping

All normalizers use the shared `_sev()` helper:

```python
_SEVERITY_MAP = {
    "critical": "CRITICAL",
    "high":     "HIGH",
    "error":    "HIGH",       # Semgrep uses "error"
    "medium":   "MEDIUM",
    "warning":  "MEDIUM",     # Some tools use "warning"
    "moderate": "MEDIUM",     # GitHub Advisory uses "moderate"
    "low":      "LOW",
    "info":     "INFO",
    "informational": "INFO",
    "note":     "INFO",       # Semgrep uses "note"
    "unknown":  "UNKNOWN",
}
```

Any severity string not in the map becomes `"UNKNOWN"`. Normalizers may override this with a hardcoded severity when the tool's output doesn't include one (e.g. Gitleaks, TruffleHog).

---

## Function Signatures

### `normalize_semgrep(data, tool_id="semgrep")`

**Input shape**

```json
{
  "results": [
    {
      "check_id": "python.lang.security.audit.exec-use",
      "path": "app/views.py",
      "start": { "line": 42 },
      "extra": {
        "severity": "ERROR",
        "message": "Use of exec() detected.",
        "metadata": {
          "references": ["https://cwe.mitre.org/data/definitions/78.html"]
        }
      }
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `extra.severity` |
| `title` | `extra.message` (truncated to 120 chars) |
| `description` | `extra.message` |
| `location` | `path:start.line` |
| `rule_id` | `check_id` |
| `references` | `extra.metadata.references` (string or list) |
| `scan_type` | `"SAST"` (caller overrides to `"Secrets"` for p/secrets mode) |

---

### `normalize_opengrep(data, tool_id="opengrep")`

Delegates to `normalize_semgrep` — OpenGrep produces the same JSON schema.

---

### `normalize_trivy_fs(data, tool_id="trivy", scan_type_label="SCA")`

Used for SCA (`trivy fs`) and Build (`trivy image`) scans. `scan_type_label` is `"SCA"` or `"Build"`.

**Input shape**

```json
{
  "Results": [
    {
      "Target": "package-lock.json",
      "Vulnerabilities": [
        {
          "VulnerabilityID": "CVE-2023-12345",
          "PkgName": "lodash",
          "InstalledVersion": "4.17.15",
          "FixedVersion": "4.17.21",
          "Severity": "HIGH",
          "Title": "Prototype Pollution in lodash",
          "Description": "...",
          "References": ["https://nvd.nist.gov/..."]
        }
      ]
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `Severity` |
| `title` | `Title` or `VulnerabilityID` |
| `description` | `Description` |
| `location` | `PkgName@InstalledVersion` |
| `rule_id` | `VulnerabilityID` |
| `cve` | `VulnerabilityID` if it starts with `"CVE-"` |
| `fix_version` | `FixedVersion` |
| `references` | `References` |

---

### `normalize_trivy_iac(data, tool_id="trivy")`

Used for IaC scans (`trivy config`).

**Input shape**

```json
{
  "Results": [
    {
      "Target": "main.tf",
      "Misconfigurations": [
        {
          "ID": "AVD-AWS-0001",
          "AVDID": "AVD-AWS-0001",
          "Title": "Security group allows all traffic",
          "Description": "...",
          "Severity": "HIGH",
          "PrimaryURL": "https://avd.aquasec.com/misconfig/avd-aws-0001",
          "References": [...]
        }
      ]
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `Severity` |
| `title` | `Title` or `ID` |
| `description` | `Description` or `Message` |
| `location` | `Target` (file path) |
| `rule_id` | `ID` or `AVDID` |
| `references` | `PrimaryURL` prepended to `References` (capped at 3) |

---

### `normalize_trivy_secrets(data, tool_id="trivy")`

Used for secrets scans (`trivy fs --scanners secret`).

**Input shape**

```json
{
  "Results": [
    {
      "Target": "config/settings.py",
      "Secrets": [
        {
          "RuleID": "aws-access-key-id",
          "Title": "AWS Access Key ID",
          "Category": "AWS",
          "Severity": "CRITICAL",
          "StartLine": 17
        }
      ]
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `Severity` (defaults to `"HIGH"`) |
| `title` | `Title` or `RuleID` |
| `description` | `"Category: <Category>"` |
| `location` | `Target:StartLine` |
| `rule_id` | `RuleID` |

---

### `normalize_grype(data, tool_id="grype")`

**Input shape**

```json
{
  "matches": [
    {
      "vulnerability": {
        "id": "CVE-2023-12345",
        "severity": "High",
        "description": "...",
        "fix": { "versions": ["4.17.21"] },
        "urls": ["https://nvd.nist.gov/..."]
      },
      "artifact": {
        "name": "lodash",
        "version": "4.17.15"
      }
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `vulnerability.severity` |
| `title` | `vulnerability.description` (first 120 chars) or `vulnerability.id` |
| `description` | `vulnerability.description` |
| `location` | `artifact.name@artifact.version` |
| `rule_id` | `vulnerability.id` |
| `cve` | `vulnerability.id` if starts with `"CVE-"` |
| `fix_version` | `vulnerability.fix.versions[0]` |
| `references` | `vulnerability.urls` |

---

### `normalize_syft(data, tool_id="syft")`

Syft is an inventory tool, not a vulnerability scanner. Findings are always `INFO` severity.

**Input shape**

```json
{
  "artifacts": [
    {
      "name": "lodash",
      "version": "4.17.21",
      "type": "npm",
      "language": "javascript",
      "purl": "pkg:npm/lodash@4.17.21",
      "licenses": [{ "value": "MIT" }],
      "locations": [{ "path": "node_modules/lodash/package.json" }]
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | Always `"INFO"` |
| `title` | `name@version` |
| `description` | Composed: `"<type> package, language: <lang>, license: <lic>, purl: <purl>"` |
| `location` | `locations[0].path` |
| `rule_id` | `purl` |

---

### `normalize_owasp_dc(data, tool_id="owasp-dc")`

**Input shape**

```json
{
  "dependencies": [
    {
      "fileName": "struts2-core-2.5.10.jar",
      "vulnerabilities": [
        {
          "name": "CVE-2017-5638",
          "severity": "CRITICAL",
          "description": "...",
          "references": [{ "url": "https://nvd.nist.gov/..." }]
        }
      ]
    }
  ]
}
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `severity` |
| `title` | `name` (the CVE or advisory ID) |
| `description` | `description` |
| `location` | `fileName` |
| `rule_id` | `name` |
| `cve` | `name` if starts with `"CVE-"` |
| `references` | `references[].url` |

---

### `normalize_checkov(data, tool_id="checkov", scan_type_label="IaC")`

Checkov can output either a single result object or a list (one per framework detected). The normalizer handles both.

**Input shape**

```json
[
  {
    "results": {
      "failed_checks": [
        {
          "check_id": "CKV_AWS_2",
          "check_name": "Ensure ALB protocol is HTTPS",
          "file_path": "main.tf",
          "file_line_range": [10, 20],
          "resource": "aws_alb_listener.example",
          "check_type": "terraform",
          "guideline": "https://docs.prismacloud.io/..."
        }
      ]
    }
  }
]
```

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `severity` if present, else `"MEDIUM"` |
| `title` | `check_name` or `check_id` |
| `description` | `"Resource: <resource>\nFramework: <check_type>"` |
| `location` | `file_path:file_line_range[0]` |
| `rule_id` | `check_id` |
| `references` | `[guideline]` if present |
| `scan_type` | `scan_type_label` (`"IaC"` or `"Secrets"`) |

---

### `normalize_kics(data, tool_id="kics")`

**Input shape**

```json
{
  "queries": [
    {
      "query_id": "abcdef12-...",
      "query_name": "Hardcoded Credentials",
      "description": "...",
      "severity": "HIGH",
      "url": "https://docs.kics.io/...",
      "files": [
        { "file_name": "docker-compose.yml", "line": 14 }
      ]
    }
  ]
}
```

**Mapping**

One finding is emitted per `(query, file)` pair.

| Finding field | Source |
|---|---|
| `severity` | `severity` |
| `title` | `query_name` |
| `description` | `description` |
| `location` | `file_name:line` |
| `rule_id` | `query_id` |
| `references` | `[url]` if present |

---

### `normalize_gitleaks(data, tool_id="gitleaks")`

Gitleaks outputs a JSON array.

**Input shape**

```json
[
  {
    "RuleID": "aws-access-key",
    "Description": "AWS Access Key",
    "Match": "AKIAIOSFODNN7EXAMPLE",
    "File": "config/aws.yml",
    "StartLine": 8
  }
]
```

**Severity logic**: rules containing `"private-key"` or `"secret-key"` (case-insensitive) are `CRITICAL`; all others are `HIGH`. Gitleaks does not output a severity field.

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | Rule-based: `CRITICAL` for private/secret keys, else `HIGH` |
| `title` | `Description` (truncated to 120) |
| `description` | `Description — matched: <Match[:80]>` |
| `location` | `File:StartLine` |
| `rule_id` | `RuleID` |

---

### `normalize_trufflehog(data, tool_id="trufflehog")`

TruffleHog outputs NDJSON (one JSON object per line). The scanner writes each line to `results.json` and the normalizer receives a list of parsed objects.

**Input shape** (each line)

```json
{
  "DetectorName": "AWS",
  "DetectorType": 2,
  "Verified": true,
  "Raw": "AKIAIOSFODNN7EXAMPLE",
  "SourceMetadata": {
    "Data": {
      "Filesystem": { "file": "config/prod.env", "line": 3 }
    }
  }
}
```

**Severity logic**: `Verified=true` → `CRITICAL`; `Verified=false` → `HIGH`.

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `CRITICAL` if `Verified`, else `HIGH` |
| `title` | `"<DetectorName> credential detected (verified live)"` or `"(unverified)"` |
| `description` | Detector name + verification status + truncated match preview |
| `location` | `SourceMetadata.Data.Filesystem.file:line` |
| `rule_id` | `DetectorType` (numeric) |

The `Raw` field contains the matched secret. A 4+8+4 character preview (`AKIA…IPLE`) is included in the description. The full secret is preserved in `raw` but is not shown in the table by default.

---

### `normalize_mobsfscan(data, tool_id="mobsfscan")`

**Input shape**

```json
{
  "results": {
    "findings": [
      {
        "rule_id": "android_logging",
        "title": "Debug Logging Enabled",
        "description": "...",
        "severity": "medium",
        "ref": "https://mobile-security.gitbook.io/...",
        "file_details": [
          { "file_path": "app/src/main/java/com/example/MainActivity.java", "match_lines": [42] }
        ]
      }
    ]
  }
}
```

One finding is emitted per `(finding, file_detail)` pair.

**Mapping**

| Finding field | Source |
|---|---|
| `severity` | `severity` |
| `title` | `title` |
| `description` | `description` |
| `location` | `file_path:match_lines[0]` |
| `rule_id` | `rule_id` |
| `references` | `[ref]` if present |

---

## Adding a Normalizer

1. Inspect the tool's raw output format by running it manually or enabling debug logging.
2. Write a function following the signature `normalize_<tool>(data: <list|dict>, tool_id: str = "<tool>") -> list[Finding]`.
3. Map every meaningful field to the canonical `Finding` fields. Store the original object in `raw` for the expanded row view.
4. Use `_sev()` for severity mapping; if the tool doesn't output severity, pick a sensible hardcoded default or infer it from the finding type.
5. Keep `title` under 120 characters — it's displayed in the table without truncation.
6. Import and call the function from the scanner's `parse_output()` method.
