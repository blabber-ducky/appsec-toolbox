# API Reference

Base URL: `http://localhost:8080/api`

All responses are JSON unless noted. Errors return `{ "detail": "<message>" }` with an appropriate HTTP status code.

---

## Tools

### `GET /api/tools`

Returns the full tool registry grouped by scan category. The frontend uses this to render tool cards and populate the tool picker.

**Response**

```json
{
  "tools": {
    "sast": [
      {
        "id": "semgrep",
        "name": "Semgrep",
        "image": "semgrep/semgrep:latest",
        "recommended": true,
        "tooltip": "...",
        "hint": "...",
        "supports_spdx": false,
        "input_type": "source"
      }
    ],
    "sca": [ ... ],
    "iac": [ ... ],
    "secrets": [ ... ],
    "build": [ ... ],
    "mobile": [ ... ]
  }
}
```

**`input_type`** values:
- `"source"` — expects ZIP or Git URL
- `"image"` — expects Docker image tar.gz or registry reference

---

## Scans

### `POST /api/scan/start`

Starts a scan. Returns immediately; the scan runs as a background task.

**Request** — `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `scan_type` | string | yes | `SAST` / `SCA` / `IaC` / `Secrets` / `Build` / `Mobile` |
| `tool_id` | string | yes | Tool ID from the registry (e.g. `trivy`, `semgrep`) |
| `input_type` | string | yes | `zip` / `git` / `image_tar` / `image_ref` |
| `session_id` | string | no | Browser session ID. If supplied, prior scans for this session are purged. |
| `file` | binary | conditional | Required when `input_type` is `zip` or `image_tar` |
| `git_url` | string | conditional | Required when `input_type` is `git` |
| `image_ref` | string | conditional | Required when `input_type` is `image_ref` |

**Response** `200 OK`

```json
{
  "scan_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "7b3f9c21-..."
}
```

Use `scan_id` to connect to the log WebSocket and poll for results.

---

### `WS /api/scan/logs/{scan_id}`

WebSocket endpoint for live scan log streaming.

**Connect** immediately after receiving `scan_id` from `/scan/start`. The server replays all buffered messages for late-connecting clients, so connecting after the scan completes still delivers the full log.

**Message format** (JSON frames)

| `type` | Additional fields | Description |
|---|---|---|
| `log` | `message: string` | Raw line of output from the container |
| `stage` | `label: string`, `status: "running"\|"done"\|"error"` | Scan stage changed |
| `done` | `status: "complete"\|"failed"` | Scan finished; close the connection |
| `ping` | — | Keep-alive heartbeat sent every 30 s |

**Example message sequence**

```json
{"type": "stage", "label": "Pulling aquasec/trivy:latest", "status": "running"}
{"type": "log", "message": "[docker] Pulling aquasec/trivy:latest ..."}
{"type": "log", "message": "[docker] Pull complete"}
{"type": "stage", "label": "Pulling aquasec/trivy:latest", "status": "done"}
{"type": "stage", "label": "Running trivy scan", "status": "running"}
{"type": "log", "message": "2024-01-15T10:23:44Z INFO ..."}
{"type": "stage", "label": "Running trivy scan", "status": "done"}
{"type": "stage", "label": "Parsing results", "status": "running"}
{"type": "stage", "label": "Parsing results", "status": "done"}
{"type": "done", "status": "complete"}
```

---

## Results

### `GET /api/results/{scan_id}`

Returns normalized findings and scan metadata.

**Path parameters**

| Parameter | Description |
|---|---|
| `scan_id` | The UUID returned by `/scan/start` |

**Response** `200 OK`

```json
{
  "scan_id": "550e8400-...",
  "status": "complete",
  "error": null,
  "tool_id": "trivy",
  "scan_type": "SCA",
  "total": 42,
  "findings": [
    {
      "id": "uuid",
      "tool": "trivy",
      "scan_type": "SCA",
      "severity": "HIGH",
      "title": "CVE-2023-12345 in lodash",
      "description": "Prototype pollution ...",
      "location": "lodash@4.17.15",
      "rule_id": "CVE-2023-12345",
      "cve": "CVE-2023-12345",
      "fix_version": "4.17.21",
      "references": ["https://nvd.nist.gov/vuln/detail/CVE-2023-12345"],
      "raw": { ... }
    }
  ],
  "columns": [
    {
      "key": "severity",
      "label": "Severity",
      "description": "Risk level: CRITICAL, HIGH, MEDIUM, LOW, or INFO",
      "default": true
    },
    { "key": "title", ... },
    { "key": "cve", ... },
    { "key": "fix_version", ... }
  ],
  "has_spdx": true
}
```

**`status`** values: `pending` / `running` / `complete` / `failed`

**`columns`** — only columns with at least one non-empty value across all findings are returned. Use `default: true` to pre-select the initial visible set.

**`has_spdx`** — `true` when an SPDX SBOM was generated and is available for download.

**Error responses**

| Status | Condition |
|---|---|
| `404` | `scan_id` not found |

---

### `GET /api/results/{scan_id}/logs`

Returns all buffered log messages for a completed scan. Useful for post-hoc inspection without a WebSocket connection.

**Response** `200 OK`

```json
{
  "scan_id": "550e8400-...",
  "logs": [
    {"type": "stage", "label": "Pulling semgrep/semgrep:latest", "status": "running"},
    {"type": "log", "message": "[docker] Pulling semgrep/semgrep:latest ..."},
    ...
    {"type": "done", "status": "complete"}
  ]
}
```

---

### `GET /api/results/{scan_id}/export/csv`

Downloads findings as a CSV file.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `columns` | string | Comma-separated list of column keys to include (e.g. `severity,title,cve`). Omit to use all default columns. |

**Response** — `text/csv` with `Content-Disposition: attachment; filename="appsec-<tool>-<scan_id_prefix>.csv"`

**Available column keys**: `severity`, `title`, `location`, `rule_id`, `cve`, `fix_version`, `description`, `references`, `tool`

---

### `GET /api/results/{scan_id}/export/spdx`

Downloads the SPDX SBOM generated during the scan.

**Response** — `application/json` with `Content-Disposition: attachment; filename="sbom-<tool>-<scan_id_prefix>.spdx.json"`

**Error responses**

| Status | Condition |
|---|---|
| `404` | `scan_id` not found, or SPDX not available for this scan |

---

## Health

### `GET /api/health`

Liveness check.

**Response** `200 OK`

```json
{"status": "ok"}
```

---

## Severity Levels

| Value | Meaning |
|---|---|
| `CRITICAL` | Actively exploitable, severe impact |
| `HIGH` | High likelihood or high impact |
| `MEDIUM` | Moderate risk; fix in normal sprint cycle |
| `LOW` | Low risk; informational, track for hygiene |
| `INFO` | Informational; no direct security impact (e.g. SBOM inventory items) |
| `UNKNOWN` | Scanner did not provide a severity |

---

## Scan Types

| Value | Description |
|---|---|
| `SAST` | Static Application Security Testing — code patterns |
| `SCA` | Software Composition Analysis — dependency CVEs |
| `IaC` | Infrastructure as Code — misconfigurations |
| `Secrets` | Hardcoded credentials and API keys |
| `Build` | Container image CVE scanning |
| `Mobile` | Android / iOS source code analysis |
