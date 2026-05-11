# Agent Progress Tracker — AppSec Toolbox

> Updated after each completed phase or significant milestone.
> Format: `[x]` = done, `[-]` = in progress, `[ ]` = not started

---

## Project Summary

| Item | Detail |
|---|---|
| Goal | Containerized appsec scanning hub running SAST, SCA, IaC, and Build scans via ephemeral Docker containers |
| Stack | Python 3.12 + FastAPI / React 18 + Vite + Tailwind + shadcn/ui |
| Non-persistent | All results in-memory; wiped on new scan, scan type switch, or container restart |
| Started | 2026-05-11 |
| Last updated | 2026-05-11 (full implementation complete) |

---

## Phase Overview

| Phase | Description | Status | Completed |
|---|---|---|---|
| 0 | Project setup & documentation | Done | 2026-05-11 |
| 1 | Skeleton — containers, API scaffold, frontend scaffold | Done | 2026-05-11 |
| 2 | Core engine — workspace, Docker runner, WebSocket | Done | 2026-05-11 |
| 3 | Tool integrations — all 5 scanners | Done | 2026-05-11 |
| 4 | Results pipeline — normalizers, store, CSV, SPDX, column selection | Done | 2026-05-11 |
| 5 | UX polish — cards, tooltips, column picker, toasts | Done | 2026-05-11 |
| 6 | Packaging — multi-stage Dockerfile, compose, README | Done | 2026-05-11 |

---

## Phase 0 — Project Setup & Documentation

**Status:** Done — 2026-05-11

### Tasks
- [x] Define architecture and tech stack
- [x] Design normalized `Finding` schema
- [x] Design tool registry YAML format
- [x] Design column selection feature (data-driven from result introspection)
- [x] Write `CLAUDE.md` with project rules and conventions
- [x] Create `Agent_Progress.md` tracker
- [x] Initialize git repository

### Notes
- Column picker derives available columns from actual result data — no hardcoded lists
- `/tmp` must be shared between host and main container so Docker-launched tool containers can access workspaces
- `tools.yaml` is the single seam for adding new tools — no frontend changes needed

---

## Phase 1 — Skeleton

**Status:** Done — 2026-05-11

### Tasks
- [x] `Dockerfile` (multi-stage: node build → python runtime)
- [x] `docker-compose.yml` with socket + `/tmp` volume mounts
- [x] `.dockerignore`
- [x] FastAPI `main.py` with health endpoint (`GET /api/health`)
- [x] `tools.yaml` with all 5 initial tools defined
- [x] `GET /api/tools` router returning tool registry to frontend
- [x] Vite + React 18 scaffold
- [x] Tailwind CSS + shadcn/ui installation and base config
- [x] API client (`lib/api.ts`) with base URL config
- [x] Proxy config in `vite.config.ts` for local dev (`/api` → FastAPI)
- [x] `backend/requirements.txt`
- [x] `frontend/package.json`

---

## Phase 2 — Core Engine

**Status:** Done — 2026-05-11

### Tasks
- [x] `core/workspace.py` — temp dir creation, zip extraction (zip-slip guarded), git clone, cleanup
- [x] `core/git_fetcher.py` — shallow clone via subprocess
- [x] `core/docker_runner.py` — pull image (streaming progress), run container, stream logs, cleanup; `pull_and_save_image` for image-ref build scans
- [x] WebSocket endpoint `WS /api/scan/logs/{scan_id}` with log replay for late connections
- [x] `POST /api/scan/start` — multipart form, purges session, fires background task
- [x] In-memory results store with `ScanState`, asyncio queue per scan
- [x] Session ID generation (browser `sessionStorage`)

---

## Phase 3 — Tool Integrations

**Status:** Done — 2026-05-11

### Tasks
- [x] `scanners/base.py` — `BaseScanner` abstract class
- [x] `scanners/sast/semgrep.py`
- [x] `scanners/sca/trivy.py` + SPDX command
- [x] `scanners/sca/owasp_dc.py` — NVD cache at `/tmp/appsec-nvd-cache`
- [x] `scanners/iac/kics.py`
- [x] `scanners/build/trivy_image.py` — tar.gz + image-ref variants; SPDX command
- [x] `scanner_factory.py` — maps tool IDs to scanner classes + loads config from YAML

---

## Phase 4 — Results Pipeline

**Status:** Done — 2026-05-11

### Tasks
- [x] `results/models.py` — `Finding` dataclass, `ColumnMeta` dataclass
- [x] `results/store.py` — store, retrieve, purge; `available_columns()` introspection; thread-safe `log_message()`
- [x] `results/normalizers.py` — semgrep, trivy_fs, trivy_image, owasp_dc, kics
- [x] `results/exporter.py` — CSV filtered to active column selection
- [x] SPDX content stored in `ScanState.spdx_content` (in memory, not disk)
- [x] `GET /api/results/{scan_id}` — returns findings + data-driven columns + has_spdx flag
- [x] `GET /api/results/{scan_id}/export/csv?columns=...` — respects column selection
- [x] `GET /api/results/{scan_id}/export/spdx` — streams SPDX JSON

---

## Phase 5 — UX Polish

**Status:** Done — 2026-05-11

### Tasks
- [x] `ScanTypeCard.tsx` — home screen with 4 large scan type cards + icons + descriptions
- [x] `ToolPicker.tsx` — radio-style tool selector, tooltip popovers, hint text
- [x] `InputPanel.tsx` — drag-and-drop zip/tar upload + git/image-ref text toggle, developer-friendly copy
- [x] `ScanProgress.tsx` — WebSocket log stream, auto-scroll terminal, severity-coloured log lines
- [x] `ResultsTable.tsx` — TanStack Table, sortable columns, severity filter bar, text search, expandable rows
- [x] `ColumnSelector.tsx` — popover checkbox list, column description tooltips, defaults/all shortcuts
- [x] `ExportBar.tsx` — CSV + SPDX download buttons, severity summary badges, finding count
- [x] Result purge confirmation dialog
- [x] Severity summary badges in results header
- [x] Breadcrumb navigation between wizard steps

---

## Phase 6 — Packaging

**Status:** Done — 2026-05-11

### Tasks
- [x] Multi-stage `Dockerfile`: stage 1 builds React (node:20-alpine), stage 2 is python:3.12-slim with built assets served via FastAPI `StaticFiles`
- [x] `docker-compose.yml` with socket + `/tmp` bind mounts and explanatory comments
- [x] `.dockerignore` — excludes node_modules, __pycache__, .git, temp workspaces

### Remaining (post-MVP)
- [ ] `README.md` with one-liner launch, prerequisites, and "adding a tool" guide
- [ ] End-to-end smoke test of each scan type in the final container

---

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-05-11 | In-memory results only | Non-persistent by design; simplifies architecture and removes auth concerns |
| 2026-05-11 | `/tmp` shared between host and app container | Tool containers are launched by host daemon; volume paths must resolve on the host |
| 2026-05-11 | Tool cards rendered from `GET /api/tools` | Adding tools requires no frontend changes |
| 2026-05-11 | Column list derived from result data, not hardcoded | Automatically stays accurate when new tools added; no phantom checkboxes |
| 2026-05-11 | `network_mode="none"` for tool containers | Tools don't need internet at scan time; limits blast radius if a tool image is compromised |
| 2026-05-11 | shadcn/ui + TanStack Table | Gives polished, accessible data table with sort/filter/column-visibility built in |

---

## Known Issues / Blockers

_None at this time._

---

## Upcoming Decisions Needed

- [ ] How to handle OWASP Dependency Check's NVD data download on first run (can be slow — show warning in UI?)
- [ ] Whether to support concurrent scans per session or enforce one-at-a-time
- [ ] Port number for the app (defaulting to 8080)
