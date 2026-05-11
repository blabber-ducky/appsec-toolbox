# AppSec Toolbox — CLAUDE.md

## Project Purpose

A containerized, browser-based application security scanning hub. The main container runs a FastAPI + React web app; all scan tools are executed as ephemeral Docker containers pulled on demand via the mounted host Docker socket. Non-persistent — all results live in memory and are wiped on each new scan or tab close.

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui |
| Docker integration | `docker` Python SDK (via `/var/run/docker.sock`) |
| Streaming | WebSocket (FastAPI native) |
| Temp workspace | Python `tempfile` + Docker volume mounts |
| Tool config | `backend/config/tools.yaml` (declarative, no code changes to add tools) |

## Repository Layout

```
appsec-toolbox/
├── Dockerfile                     # Multi-stage: frontend build → backend image
├── docker-compose.yml             # One-command launch with socket binding
├── .dockerignore
├── CLAUDE.md                      # This file
├── Agent_Progress.md              # Build tracker — update after every phase
│
├── backend/
│   ├── main.py                    # FastAPI entrypoint, router registration
│   ├── config/
│   │   └── tools.yaml             # Tool registry — THE extensibility seam
│   ├── core/
│   │   ├── docker_runner.py       # Pull + run tool containers, stream logs
│   │   ├── workspace.py           # Temp dir lifecycle (zip extract, git clone)
│   │   └── git_fetcher.py         # git clone via gitpython
│   ├── scanners/
│   │   ├── base.py                # Abstract BaseScanner
│   │   ├── sast/semgrep.py
│   │   ├── sca/trivy.py
│   │   ├── sca/owasp_dc.py
│   │   ├── iac/kics.py
│   │   └── build/trivy_image.py
│   ├── results/
│   │   ├── models.py              # Finding + ColumnMeta dataclasses
│   │   ├── store.py               # In-memory results store + column introspection
│   │   ├── normalizers.py         # Per-tool JSON → Finding converters
│   │   └── exporter.py            # CSV export (respects column selection) + SPDX
│   ├── routers/
│   │   ├── scans.py               # POST /scan/start, WS /scan/logs/{session_id}
│   │   ├── results.py             # GET /results/{session_id}, /export/csv, /export/spdx
│   │   └── tools.py               # GET /tools — feeds frontend tool cards dynamically
│   └── requirements.txt
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── ScanTypeCard.tsx    # Home screen: SAST / SCA / IaC / Build cards
        │   ├── ToolPicker.tsx      # Tool selector with tooltip popovers
        │   ├── InputPanel.tsx      # Zip upload + git URL toggle
        │   ├── ScanProgress.tsx    # WebSocket log stream + progress bar
        │   ├── ResultsTable.tsx    # TanStack Table: sortable, filterable, severity-colored
        │   ├── ColumnSelector.tsx  # Column picker popover — data-driven from API response
        │   └── ExportBar.tsx       # CSV + SPDX download buttons
        ├── hooks/
        │   ├── useScanSocket.ts    # WebSocket hook
        │   └── useResults.ts       # Fetches findings + column metadata
        └── lib/
            └── api.ts             # Typed API client (all fetch calls live here)
```

## Key Architectural Rules

### Tool Registry (`tools.yaml`) is the single extensibility seam
- Every tool card, tooltip, hint, and command is driven from this file
- Adding a new tool: add a YAML block + a scanner parser class + register in factory
- Frontend renders tool cards dynamically from `GET /api/tools` — no frontend changes needed for new tools

### Normalized Finding schema — never break this contract
Every scanner must convert its native output to the `Finding` dataclass in `results/models.py`. Fields:
`id`, `tool`, `scan_type`, `severity`, `title`, `description`, `location`, `rule_id`, `cve`, `fix_version`, `references`, `raw`

### Column selection is data-driven
`available_columns()` in `store.py` introspects the actual result set and returns only columns with non-empty values. The frontend renders the column picker from this response — no hardcoded column lists in the UI.

### Results purge triggers
Clear `store[session_id]` when:
1. User clicks "New Scan"
2. User switches scan type
3. User switches tool within a scan type

### Docker security posture for tool containers
- Source workspace mounted **read-only** (`/src`)
- Output dir mounted **read-write** (`/out`)
- `network_mode="none"` — tools run air-gapped at scan time
- `remove=True` — containers auto-deleted on exit
- Main container needs `docker` group or root to access the socket (document in README)

### No disk persistence
- All results in-process dict: `{ session_id: List[Finding] }`
- Temp workspaces in `/tmp` — cleaned up after results are read
- Container restart = clean state (by design)

## Development Conventions

- **Python**: follow PEP 8, use `dataclasses` over dicts for structured data, type-hint all function signatures
- **FastAPI**: all routes in `routers/`, business logic in `core/` and `scanners/` — never put logic in route handlers
- **React**: functional components only, custom hooks for all data fetching, no inline styles (Tailwind only)
- **No comments** unless the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant)
- **No dead code**: if a feature is removed, delete it completely
- **Commit discipline**: one logical change per commit, imperative mood subject line ("Add Semgrep normalizer", not "Added" or "Adding")

## Running Locally (once built)

```bash
docker compose up --build
# App available at http://localhost:8080
```

## Adding a New Scanner Tool

1. Add a block to `backend/config/tools.yaml` with: `id`, `name`, `image`, `tooltip`, `hint`, `cmd_template`, `output_format`, `output_file`, `supports_spdx`
2. Create `backend/scanners/<scan_type>/<tool_id>.py` implementing `BaseScanner.parse_output(raw: dict) -> list[Finding]`
3. Register it in the scanner factory dict in `backend/main.py`
4. Update `Agent_Progress.md`

## SPDX Generation

Only tools with `supports_spdx: true` in `tools.yaml` expose the SPDX export button. Currently:
- Trivy SCA: `trivy fs --format spdx-json`
- Trivy Image: `trivy image --format spdx-json`

## Environment / Docker Compose Notes

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock   # required — host socket
  - /tmp:/tmp                                    # shared temp workspace between app and tool containers
```

The `/tmp` share is required because tool containers are started by the host Docker daemon, so volume paths must be valid on the **host**, not inside the main app container.
