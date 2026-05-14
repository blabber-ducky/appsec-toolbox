# AppSec Toolbox

A containerized, browser-based application security scanning hub. Select a scan category, pick a tool, upload your code or container image, and get normalized findings in a sortable, filterable table — all without installing any security tools locally.

Every scanner runs as an ephemeral Docker container pulled on demand. Results live in memory only; closing the tab or starting a new scan wipes them.

---

## Features

- **6 scan categories** — SAST, SCA, IaC, Secrets, Build (container image), Mobile
- **12 scanners** across all categories, with recommended defaults highlighted
- **Multi-category tools** — Trivy, Semgrep, Grype, Syft, and Checkov each appear in every category they support, with the right command selected automatically
- **Live scan log streaming** over WebSocket with replay for late-connecting clients
- **Normalized findings table** — sortable, filterable by severity, with expandable raw detail rows
- **Dynamic column selection** — only columns with data in the result set are shown; you pick which to display
- **CSV export** respecting your column selection
- **SPDX SBOM export** for tools that produce a software bill of materials (Trivy SCA, Trivy Build, Syft)
- **Scan log viewer** — inspect the full container output after a scan completes
- No disk persistence — zero cleanup required

---

## Scan Categories and Tools

| Category | Recommended | Also Available |
|---|---|---|
| SAST | Semgrep | OpenGrep |
| SCA | Trivy | Grype, Syft (SBOM), OWASP Dependency Check |
| IaC | Checkov | Checkmarx KICS, Trivy |
| Secrets | TruffleHog | Gitleaks, Semgrep |
| Build | Trivy | Grype, Syft (Image SBOM) |
| Mobile | MobSF (mobsfscan) | — |

---

## Quick Start

### Prerequisites

- Docker Engine (or Docker Desktop) running on the host
- Docker Compose v2

### Run

```bash
git clone <repo-url> appsec-toolbox
cd appsec-toolbox
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

The first scan of each tool will pull its container image (this can take 1–5 minutes depending on your connection and the tool). Subsequent scans reuse cached layers.

### Stop

```bash
docker compose down
```

---

## How to Use

1. **Choose a scan category** from the home screen.
2. **Select a tool** — tools marked "Recommended" are good defaults if you have no preference. Hover the info icon for a description of what each tool does.
3. **Provide input** — upload a ZIP of your source tree, paste a Git URL, or upload/reference a Docker image (for Build scans).
4. Watch the **live scan log** stream while the container runs.
5. Explore **findings** in the results table. Filter by severity, sort any column, expand rows for raw detail.
6. **Export** results as CSV or SPDX SBOM if available.
7. Click **New Scan** to start over. Results are wiped from memory.

---

## Input Formats

| Scan Type | ZIP upload | Git URL | Image tar.gz | Registry ref |
|---|---|---|---|---|
| SAST | yes | yes | — | — |
| SCA | yes | yes | — | — |
| IaC | yes | yes | — | — |
| Secrets | yes | yes | — | — |
| Build | — | — | yes | yes |
| Mobile | yes | — | — | — |

**ZIP**: compress your project root with `zip -r archive.zip .` — include lock files and manifests for best SCA results.

**Git URL**: any HTTPS-accessible repository. The server clones it at scan time.

**Image tar.gz**: export with `docker save myimage:tag | gzip > image.tar.gz`.

**Registry ref**: any image reference reachable from the server (e.g. `nginx:latest`, `python:3.12-slim`). The server pulls and saves it before scanning.

---

## Architecture Overview

```
Browser
  │  HTTP + WebSocket
  ▼
FastAPI (port 8080)          ← serves React SPA + API
  │
  ├── POST /api/scan/start   ← triggers background scan task
  ├── WS   /api/scan/logs/{scan_id}  ← live log stream
  ├── GET  /api/results/{scan_id}    ← normalized findings
  ├── GET  /api/results/{scan_id}/export/csv
  ├── GET  /api/results/{scan_id}/export/spdx
  └── GET  /api/tools        ← tool registry for UI rendering

  │  Docker SDK (unix socket)
  ▼
Host Docker Daemon
  │
  └── ephemeral tool containers (one per scan)
        volumes: /tmp/appsec-<scan-id>/src  (read-only)
                 /tmp/appsec-<scan-id>/out  (read-write)
```

See [docs/architecture.md](docs/architecture.md) for a full breakdown.

---

## Adding a New Tool

1. Add a block to `backend/config/tools.yaml` under the appropriate category.
2. Create `backend/scanners/<category>/<tool_id>.py` implementing `BaseScanner`.
3. Register it in `backend/scanner_factory.py`.

See [docs/developer-guide.md](docs/developer-guide.md) for a step-by-step walkthrough.

---

## Security Notes

- Tool containers run with `network_mode=bridge` so they can download rule sets and vulnerability databases. This is required for most tools to function.
- Source code is mounted **read-only** into containers; containers cannot modify your uploaded files.
- Containers are removed immediately after they exit (`remove=True`).
- The app requires access to the host Docker socket (`/var/run/docker.sock`), which grants root-equivalent control over the Docker daemon. Run only on trusted hosts.
- Results are stored in-process memory only. No scan data is written to disk beyond the temporary workspace under `/tmp` (cleaned up after each scan).
- ZIP uploads are validated against path traversal (zip-slip) before extraction.

---

## Development

See [docs/developer-guide.md](docs/developer-guide.md).
