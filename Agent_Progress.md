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
| Last updated | 2026-05-11 |

---

## Phase Overview

| Phase | Description | Status | Completed |
|---|---|---|---|
| 0 | Project setup & documentation | Done | 2026-05-11 |
| 1 | Skeleton — containers, API scaffold, frontend scaffold | Not started | — |
| 2 | Core engine — workspace, Docker runner, WebSocket | Not started | — |
| 3 | Tool integrations — all 5 scanners | Not started | — |
| 4 | Results pipeline — normalizers, store, CSV, SPDX, column selection | Not started | — |
| 5 | UX polish — cards, tooltips, column picker, toasts | Not started | — |
| 6 | Packaging — multi-stage Dockerfile, compose, README | Not started | — |

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

**Status:** Not started

### Tasks
- [ ] `Dockerfile` (multi-stage: node build → python runtime)
- [ ] `docker-compose.yml` with socket + `/tmp` volume mounts
- [ ] `.dockerignore`
- [ ] FastAPI `main.py` with health endpoint (`GET /api/health`)
- [ ] `tools.yaml` with all 5 initial tools defined
- [ ] `GET /api/tools` router returning tool registry to frontend
- [ ] Vite + React 18 scaffold
- [ ] Tailwind CSS + shadcn/ui installation and base config
- [ ] API client (`lib/api.ts`) with base URL config
- [ ] Proxy config in `vite.config.ts` for local dev (`/api` → FastAPI)
- [ ] `backend/requirements.txt`
- [ ] `frontend/package.json`

### Acceptance Criteria
- `docker compose up --build` starts without errors
- `GET /api/health` returns `{ "status": "ok" }`
- `GET /api/tools` returns the full tool registry JSON
- React app loads at `http://localhost:8080` with placeholder content

---

## Phase 2 — Core Engine

**Status:** Not started

### Tasks
- [ ] `core/workspace.py` — temp dir creation, zip extraction, git clone, cleanup
- [ ] `core/git_fetcher.py` — clone repo from URL to temp dir
- [ ] `core/docker_runner.py` — pull image, run container, mount volumes, stream logs
- [ ] WebSocket endpoint `WS /api/scan/logs/{session_id}`
- [ ] `POST /api/scan/start` — validates input, creates workspace, triggers runner
- [ ] In-memory results store skeleton in `results/store.py`
- [ ] Session ID generation and passing

### Acceptance Criteria
- Can start a scan via API, see Docker container spin up on host
- Log lines stream to WebSocket client in real time
- Temp workspace cleaned up after container exits

---

## Phase 3 — Tool Integrations

**Status:** Not started

### Tasks

#### SAST
- [ ] `scanners/base.py` — `BaseScanner` abstract class
- [ ] `scanners/sast/semgrep.py` — cmd builder + `parse_output()`

#### SCA
- [ ] `scanners/sca/trivy.py` — cmd builder + `parse_output()` + SPDX cmd
- [ ] `scanners/sca/owasp_dc.py` — cmd builder + `parse_output()`

#### IaC
- [ ] `scanners/iac/kics.py` — cmd builder + `parse_output()`

#### Build
- [ ] `scanners/build/trivy_image.py` — tar.gz variant + image ref variant + `parse_output()` + SPDX cmd

#### Factory
- [ ] Scanner factory dict in `main.py` mapping `tool_id` → scanner class

### Acceptance Criteria
- Each scanner returns a valid `list[Finding]` from a known-good tool output fixture
- All five tools run end-to-end against a sample target and produce findings

---

## Phase 4 — Results Pipeline

**Status:** Not started

### Tasks
- [ ] `results/models.py` — `Finding` dataclass, `ColumnMeta` dataclass
- [ ] `results/store.py` — store, retrieve, purge findings; `available_columns()` introspection
- [ ] `results/normalizers.py` — per-tool converters (called by each scanner's `parse_output`)
- [ ] `results/exporter.py` — CSV export filtered by active column selection
- [ ] `results/exporter.py` — SPDX file passthrough for Trivy outputs
- [ ] `GET /api/results/{session_id}` — returns `{ findings, columns }` where `columns` is data-driven
- [ ] `GET /api/results/{session_id}/export/csv` — streams CSV
- [ ] `GET /api/results/{session_id}/export/spdx` — streams SPDX JSON

### Acceptance Criteria
- Semgrep results return: Severity, Title, Location, Rule/Check, Description columns only
- Trivy SCA results additionally return: CVE ID, Fix Version, References columns
- CSV export contains only the columns the user has selected
- SPDX export only available for Trivy tools

---

## Phase 5 — UX Polish

**Status:** Not started

### Tasks
- [ ] `ScanTypeCard.tsx` — home screen with 4 large scan type cards + icons + descriptions
- [ ] `ToolPicker.tsx` — radio-style tool selector, tooltip popover from `tools.yaml` data
- [ ] `InputPanel.tsx` — drag-and-drop zip upload + git URL toggle, developer-friendly hints
- [ ] `ScanProgress.tsx` — WebSocket log stream with animated spinner and progress bar
- [ ] `ResultsTable.tsx` — TanStack Table, sortable columns, severity color badges, row expansion
- [ ] `ColumnSelector.tsx` — popover checkbox list, column description tooltips, default state from API
- [ ] `ExportBar.tsx` — CSV + SPDX buttons, SPDX conditionally shown based on tool
- [ ] Result purge confirmation dialog ("Starting a new scan will clear current results")
- [ ] Toast notifications: scan started, scan complete, scan error
- [ ] Severity summary badges in results header (CRIT N / HIGH N / MED N / LOW N)
- [ ] Responsive layout (works at 1280px+)

### Acceptance Criteria
- Full scan flow completable without reading any documentation
- Column picker shows only columns with data for the current tool
- Column picker tooltips explain each column in developer-friendly language
- "New Scan" / scan type switch triggers purge confirmation

---

## Phase 6 — Packaging

**Status:** Not started

### Tasks
- [ ] Multi-stage `Dockerfile`: stage 1 builds React, stage 2 is Python runtime with built assets served via FastAPI `StaticFiles`
- [ ] `docker-compose.yml` finalized with correct socket permissions note
- [ ] `README.md` with one-liner launch, prerequisites, and "adding a tool" guide
- [ ] `.gitignore` for Python, Node, Docker artifacts
- [ ] Smoke test: full end-to-end run of each scan type in the final container

### Acceptance Criteria
- `docker compose up --build` → full working app at `http://localhost:8080`
- All scan types produce results and CSV export works
- No leftover temp files after a scan completes

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
