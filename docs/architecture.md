# Architecture

## Overview

AppSec Toolbox is a single-container web application that orchestrates ephemeral Docker containers to run security scanners. The main container exposes a FastAPI backend (serving the React SPA and the REST/WebSocket API) and communicates with the host Docker daemon via the mounted Unix socket to launch tool containers on demand.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  React SPA (static, served by FastAPI)                       │
│  • HTTP REST calls to /api/*                                 │
│  • WebSocket to /api/scan/logs/{scan_id}                     │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP + WS (port 8080)
┌──────────────────────▼───────────────────────────────────────┐
│  AppSec Toolbox container                                    │
│                                                              │
│  FastAPI (uvicorn)                                           │
│  ├── /api/tools          → tools.yaml → tool cards          │
│  ├── /api/scan/start     → background scan task             │
│  ├── /api/scan/logs/{id} → WebSocket log stream             │
│  ├── /api/results/{id}   → normalized findings + columns     │
│  ├── /api/results/{id}/export/csv                           │
│  └── /api/results/{id}/export/spdx                         │
│                                                              │
│  In-memory store: { scan_id → ScanState }                   │
│  Log queues:      { scan_id → asyncio.Queue }               │
└──────────────────────┬───────────────────────────────────────┘
                       │ Docker SDK (unix:///var/run/docker.sock)
┌──────────────────────▼───────────────────────────────────────┐
│  Host Docker daemon                                          │
│                                                              │
│  Ephemeral tool containers (one per scan)                    │
│  ├── source mounted at /src (read-only)                     │
│  ├── output mounted at /out (read-write)                    │
│  ├── network_mode=bridge (tool can reach internet)          │
│  └── auto-removed on exit                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Request Lifecycle

### 1. Tool registry load

On startup, `GET /api/tools` reads `backend/config/tools.yaml` and returns the full tool registry grouped by category. The React frontend renders tool cards entirely from this response — no tool information is hardcoded in the UI.

### 2. Scan initiation

`POST /api/scan/start` receives:
- `scan_type` (SAST, SCA, IaC, Secrets, Build, Mobile)
- `tool_id` (semgrep, trivy, checkov, …)
- `input_type` (zip, git, image_tar, image_ref)
- File upload or git URL or image reference

The handler:
1. Generates a `scan_id` (UUID) and `session_id` if not supplied.
2. Calls `store.purge_session(session_id)` — clears any prior scan for this browser session.
3. Creates a `ScanState` entry and an `asyncio.Queue` in the in-memory store.
4. Enqueues `_run_scan(...)` as a FastAPI background task.
5. Returns `{ scan_id, session_id }` immediately.

### 3. Background scan execution

`_run_scan` runs in a background thread pool. It communicates back to the event loop via `loop.call_soon_threadsafe(store.log_message, ...)`. Stages:

```
Prepare input
  └── ZIP: extract to workspace.src
  └── Git: clone to workspace.src
  └── image_tar: write to workspace.input/image.tar.gz
  └── image_ref: pull from registry → save to workspace.input/image.tar.gz

Pull tool image
  └── docker_runner.pull_image(scanner.image)

Run scan container
  └── scanner.prepare(workspace, scan_type=scan_type)
       → returns (volumes, command)
  └── docker_runner.run_container(image, command, volumes, ...)
       → streams stdout/stderr line-by-line to log callback
       → returns exit code

Parse results
  └── scanner.parse_output(workspace.out)
       → reads results.json written by container
       → returns List[Finding]

SPDX generation (if scanner.supports_spdx)
  └── scanner.prepare_spdx(workspace)
       → returns (spdx_command, spdx_volumes)
  └── docker_runner.run_container(...)

Cleanup
  └── workspace.cleanup() — removes /tmp/appsec-<scan_id>
```

### 4. Log streaming

The browser connects to `WS /api/scan/logs/{scan_id}` immediately after receiving the `scan_id`. The WebSocket handler:

1. Replays all buffered messages from `state.logs` (handles late connections).
2. If the scan is already done, sends a `{"type":"done"}` frame and closes.
3. Otherwise, reads from `asyncio.Queue` in a loop, forwarding each message.

Message types:

| type | fields | meaning |
|---|---|---|
| `log` | `message` | Raw line from the container |
| `stage` | `label`, `status` | Scan stage changed (running/done/error) |
| `done` | `status` | Scan finished; `status` is complete or failed |
| `ping` | — | Keep-alive heartbeat (sent every 30 s of silence) |

### 5. Results retrieval

`GET /api/results/{scan_id}` returns the full `ScanState` as JSON, including:
- All normalized `Finding` objects
- `ColumnMeta` list (only columns with non-empty data in the result set)
- `has_spdx` flag
- `status` and `error`

---

## Data Model

### Finding

The normalized output schema every scanner must produce:

```python
@dataclass
class Finding:
    id: str            # UUID
    tool: str          # tool_id from registry
    scan_type: str     # SAST / SCA / IaC / Secrets / Build / Mobile
    severity: str      # CRITICAL / HIGH / MEDIUM / LOW / INFO / UNKNOWN
    title: str         # Short finding name
    description: str   # Full explanation
    location: str      # file:line or package@version
    rule_id: str       # Rule ID / check name / CVE
    cve: str | None    # CVE identifier (SCA/Build only)
    fix_version: str | None  # Patched version
    references: list[str]    # Advisory / doc URLs
    raw: dict          # Original scanner JSON blob
```

### ScanState

Per-scan in-memory record:

```python
@dataclass
class ScanState:
    scan_id: str
    session_id: str
    tool_id: str
    scan_type: str
    status: Literal["pending", "running", "complete", "failed"]
    logs: list[dict]          # All messages ever pushed (for replay)
    findings: list[Finding]
    columns: list[ColumnMeta] # Populated columns only
    error: str | None
    spdx_content: str | None  # Raw SPDX JSON if generated
```

---

## Tool Registry

`backend/config/tools.yaml` is the single extensibility seam for tools. Its structure:

```yaml
tools:
  <category>:              # sast | sca | iac | secrets | build | mobile
    - id: <tool_id>        # used as registry key and in log messages
      name: <display name>
      image: <docker image ref>
      recommended: true | false
      tooltip: <multi-line description for UI popover>
      hint: <usage tip shown when tool is selected>
      supports_spdx: true | false
      input_type: source | image
```

The same `tool_id` can appear in multiple categories. `scanner_factory.py` maps each `tool_id` to a single scanner class — the `scan_type` kwarg passed to `prepare()` selects the correct command variant at runtime.

---

## Scanner Architecture

### BaseScanner

```python
class BaseScanner(ABC):
    def __init__(self, config: dict): ...

    @property
    def image(self) -> str: ...          # from config["image"]
    @property
    def supports_spdx(self) -> bool: ... # from config["supports_spdx"]
    @property
    def network_mode(self) -> str: ...   # "bridge" (default)
    @property
    def entrypoint(self) -> ...: ...     # None (default) or ["sh", "-c"]

    @abstractmethod
    def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
        """Return (volumes_dict, command_string) for docker run."""

    @abstractmethod
    def parse_output(self, out_dir: str) -> list[Finding]:
        """Parse scanner output into normalized findings."""

    def prepare_spdx(self, workspace) -> tuple[str, dict] | None:
        """Return (command, volumes) for SPDX pass, or None."""
```

### Multi-mode scanners

Scanners that appear in multiple categories store `_scan_mode` as instance state, set during `prepare()` and read during `parse_output()`:

```
scanner.prepare(workspace, scan_type="IaC")   → sets self._scan_mode = "IaC"
                                               → returns Trivy config command
scanner.parse_output(out_dir)                  → reads self._scan_mode == "IaC"
                                               → calls normalize_trivy_iac(...)
```

This is safe because `scanner_factory.get_scanner()` always creates a new instance per scan; there is no shared scanner state between concurrent scans.

### stdout-only tools

Some tools (TruffleHog, Checkov) write JSON to stdout rather than a file. These scanners override `entrypoint` to `["sh", "-c"]` and use shell redirection in the command string:

```python
@property
def entrypoint(self) -> list:
    return ["sh", "-c"]

# command passed to docker run:
"checkov -d /src -o json --compact --quiet > /out/results.json 2>/dev/null; exit 0"
```

`docker_runner.run_container` conditionally includes `entrypoint` in `run_kwargs` only when it is not `None`, avoiding an inadvertent override for tools that rely on the image's built-in entrypoint.

---

## Workspace Layout

Each scan gets an isolated directory under `/tmp`:

```
/tmp/appsec-<scan-id>/
├── src/          ← source code (extracted from ZIP or git clone)
├── out/          ← scanner writes results.json and optionally sbom.spdx.json here
├── input/        ← container image tar (for Build scans)
└── upload.zip    ← temporary, deleted after extraction
```

`/tmp` is bind-mounted from the host into the main container. Tool containers are launched by the **host** Docker daemon and receive volume paths that must be valid **on the host** — mounting through `/tmp` is what makes this work.

---

## Column Introspection

After parsing, `available_columns(findings)` filters `ALL_COLUMNS` to only those with a non-empty value in at least one finding:

```python
ALL_COLUMNS = [severity, title, location, rule_id, cve, fix_version,
               description, references, tool]

# If no finding has a CVE, "cve" is excluded from the returned list.
```

The frontend receives only populated columns and renders the column picker accordingly. No hardcoded column lists exist in the UI.

---

## Session and Results Lifecycle

- `session_id` is generated by the browser on first visit and stored in `sessionStorage`. It persists across scans within the same tab but not across tabs or page reloads.
- `store.purge_session(session_id)` is called at the start of every new scan, removing all prior `ScanState` entries for that session. This bounds memory usage to one scan's worth of findings per browser tab.
- There is no TTL or background eviction. Memory grows if many scans are started from different sessions without clearing. A server restart resets all state.

---

## Security Posture

| Concern | Mitigation |
|---|---|
| Arbitrary code execution via scan input | Source mounted read-only; containers auto-removed; no shell access exposed |
| Path traversal in ZIP uploads | `workspace.extract_zip` validates every entry path before extraction |
| Container escape | Tool containers have no elevated capabilities; network is bridge (not host) |
| Docker socket access | Required for the feature to work; document the trust implication clearly |
| Secrets in scan results | Results are in-memory only; no database writes; cleared on new scan |
| CORS | Open (`allow_origins=["*"]`) — acceptable for a single-tenant local tool; restrict for shared deployments |
