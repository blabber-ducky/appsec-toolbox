# Developer Guide

## Prerequisites

- Docker Engine (the host daemon is used at runtime; also required to build the image)
- Python 3.12 (for running the backend outside Docker during development)
- Node 20 (for running the frontend dev server)
- Git

---

## Local Development

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend will be at `http://localhost:8000`. It talks to the host Docker daemon at `/var/run/docker.sock` — you need to be in the `docker` group or run as root for this to work.

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000` (configured in `vite.config.ts`).

### Full stack via Docker Compose

```bash
docker compose up --build
# http://localhost:8080
```

---

## Repository Layout

```
appsec-toolbox/
├── Dockerfile                  # Multi-stage: frontend build → Python image
├── docker-compose.yml
├── docs/                       # This documentation
├── backend/
│   ├── main.py                 # FastAPI app, router registration
│   ├── scanner_factory.py      # tool_id → scanner class mapping
│   ├── config/
│   │   └── tools.yaml          # Tool registry (the extensibility seam)
│   ├── core/
│   │   ├── docker_runner.py    # Pull + run containers, stream logs
│   │   ├── workspace.py        # Temp dir lifecycle
│   │   └── git_fetcher.py      # git clone via gitpython
│   ├── scanners/
│   │   ├── base.py             # BaseScanner ABC
│   │   ├── trivy.py            # TrivyScanner (SCA / IaC / Build / Secrets)
│   │   ├── sast/
│   │   │   ├── semgrep.py
│   │   │   └── opengrep.py
│   │   ├── sca/
│   │   │   ├── grype.py
│   │   │   ├── syft.py
│   │   │   └── owasp_dc.py
│   │   ├── iac/
│   │   │   ├── checkov.py
│   │   │   └── kics.py
│   │   ├── secrets/
│   │   │   ├── trufflehog.py
│   │   │   └── gitleaks.py
│   │   └── mobile/
│   │       └── mobsfscan.py
│   ├── results/
│   │   ├── models.py           # Finding + ColumnMeta dataclasses
│   │   ├── store.py            # In-memory ScanState store + column introspection
│   │   ├── normalizers.py      # Per-tool JSON → Finding converters
│   │   └── exporter.py         # CSV + SPDX export
│   ├── routers/
│   │   ├── scans.py            # POST /scan/start, WS /scan/logs/{scan_id}
│   │   ├── results.py          # GET /results/{scan_id}, /export/csv, /export/spdx
│   │   └── tools.py            # GET /tools
│   └── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx             # Wizard state machine and layout
        ├── components/
        │   ├── ScanTypeCard.tsx
        │   ├── ToolPicker.tsx
        │   ├── InputPanel.tsx
        │   ├── ScanProgress.tsx
        │   ├── ResultsTable.tsx
        │   ├── ColumnSelector.tsx
        │   ├── ExportBar.tsx
        │   └── ScanLogsDialog.tsx
        ├── hooks/
        │   ├── useScanSocket.ts
        │   └── useResults.ts
        ├── lib/
        │   └── api.ts
        └── types/
            └── index.ts
```

---

## Adding a New Tool

### 1. Add a YAML block to `tools.yaml`

```yaml
tools:
  sast:                        # or sca / iac / secrets / build / mobile
    - id: mytool               # lowercase, hyphen-separated; used as the registry key
      name: My Tool
      image: vendor/mytool:latest
      recommended: false
      tooltip: >
        One-paragraph description for the UI popover. What does it scan?
        What languages/frameworks? What's special about it?
      hint: >
        One-sentence usage tip shown when the user selects this tool.
      supports_spdx: false     # true only if the tool produces an SPDX SBOM
      input_type: source       # source | image
```

The same `id` can appear under multiple categories if the tool supports them.

### 2. Create the scanner class

```bash
# Pick the right subdirectory for the primary category
touch backend/scanners/<category>/mytool.py
```

```python
from __future__ import annotations
from pathlib import Path
import json
import logging

from scanners.base import BaseScanner
from results.normalizers import normalize_mytool  # you'll write this

logger = logging.getLogger(__name__)


class MyToolScanner(BaseScanner):
    def prepare(self, workspace, scan_type=None, **kwargs) -> tuple[dict, str]:
        volumes = {
            str(workspace.src): {"bind": "/src", "mode": "ro"},
            str(workspace.out): {"bind": "/out", "mode": "rw"},
        }
        command = "mytool scan /src --format json --output /out/results.json"
        return volumes, command

    def parse_output(self, out_dir: str) -> list:
        out = Path(out_dir) / "results.json"
        if not out.exists():
            return []
        try:
            data = json.loads(out.read_text())
        except (json.JSONDecodeError, OSError):
            return []
        return normalize_mytool(data, tool_id=self.config["id"])
```

#### stdout-only tools

If the tool writes JSON to stdout instead of a file:

```python
@property
def entrypoint(self) -> list:
    return ["sh", "-c"]

def prepare(self, workspace, **kwargs) -> tuple[dict, str]:
    volumes = { ... }
    command = "mytool scan /src --json > /out/results.json 2>/dev/null; exit 0"
    return volumes, command
```

#### Multi-category tools

If the tool should behave differently depending on the category:

```python
def __init__(self, config):
    super().__init__(config)
    self._scan_mode = "default"

def prepare(self, workspace, scan_type=None, **kwargs) -> tuple[dict, str]:
    mode = (scan_type or "default").strip()
    self._scan_mode = mode

    if mode == "CategoryA":
        command = "mytool command-a /src --format json --output /out/results.json"
    else:
        command = "mytool command-b /src --format json --output /out/results.json"

    volumes = {
        str(workspace.src): {"bind": "/src", "mode": "ro"},
        str(workspace.out): {"bind": "/out", "mode": "rw"},
    }
    return volumes, command

def parse_output(self, out_dir: str) -> list:
    # use self._scan_mode to dispatch to the right normalizer
    ...
```

#### SPDX-capable tools

```python
@property
def supports_spdx(self) -> bool:
    return True   # or condition on self._scan_mode

def prepare_spdx(self, workspace) -> tuple[str, dict] | None:
    command = "mytool scan /src --format spdx-json --output /out/sbom.spdx.json"
    volumes = {
        str(workspace.src): {"bind": "/src", "mode": "ro"},
        str(workspace.out): {"bind": "/out", "mode": "rw"},
    }
    return command, volumes
```

### 3. Write the normalizer

Add a function to `backend/results/normalizers.py`:

```python
def normalize_mytool(data: dict, tool_id: str = "mytool") -> list[Finding]:
    findings = []
    for item in data.get("results", []):
        findings.append(Finding(
            id=str(uuid.uuid4()),
            tool=tool_id,
            scan_type="SAST",          # or the appropriate category
            severity=_map_severity(item.get("severity", "")),
            title=item.get("title", ""),
            description=item.get("description", ""),
            location=f"{item.get('file', '')}:{item.get('line', '')}",
            rule_id=item.get("rule_id", ""),
            cve=None,
            fix_version=None,
            references=item.get("references", []),
            raw=item,
        ))
    return findings
```

The `_map_severity` helper normalizes tool-specific severity labels to the canonical set:

```python
_SEV_MAP = {
    "critical": "CRITICAL",
    "high": "HIGH",
    "medium": "MEDIUM",
    "moderate": "MEDIUM",
    "low": "LOW",
    "info": "INFO",
    "informational": "INFO",
    "warning": "LOW",
}

def _map_severity(raw: str) -> str:
    return _SEV_MAP.get(raw.lower(), "UNKNOWN")
```

### 4. Register in `scanner_factory.py`

```python
from scanners.<category>.mytool import MyToolScanner

_REGISTRY: dict[str, type[BaseScanner]] = {
    ...
    "mytool": MyToolScanner,
}
```

If the tool appears in multiple categories under the same `id`, one registry entry covers all of them — `scan_type` is passed at runtime.

### 5. Verify

```bash
# Backend: restart uvicorn and confirm the tool appears in the API
curl http://localhost:8000/api/tools | python -m json.tool

# Frontend: the tool card appears automatically (no frontend changes needed)

# Build check
cd frontend && npm run build
```

---

## Conventions

### Python

- PEP 8 throughout.
- Type-hint all function signatures.
- Use `dataclasses` over plain dicts for structured data.
- No comments unless the WHY is non-obvious.
- No dead code — if you remove a feature, delete the code completely.

### FastAPI

- All routes in `routers/`; business logic in `core/` and `scanners/`.
- Never put logic in route handlers.

### React / TypeScript

- Functional components only.
- Custom hooks for all data fetching (`hooks/`).
- Tailwind CSS only — no inline styles.
- All API calls in `lib/api.ts`.

### Commit messages

Imperative mood, one logical change per commit:

```
Add Grype normalizer for SCA scan type
Fix severity filter crash: use keyed React.Fragment for row pairs
Map multi-category tools and add recommended highlights
```

---

## Key Invariants

**The `Finding` schema is a contract.** Every normalizer must produce valid `Finding` objects. Never add fields to `Finding` without considering the impact on `available_columns`, CSV export, and the frontend table.

**`scan_type` flows end-to-end.** `POST /scan/start` receives it from the frontend, passes it to `scanner.prepare()`, and `prepare()` stores it as `_scan_mode` for `parse_output()` to read. If you add a new category, propagate `scan_type` through the whole chain.

**`get_scanner()` creates a new instance per scan.** Scanner classes are not singletons. Instance state like `_scan_mode` is safe because each scan gets its own object. Do not use class-level mutable state.

**`/tmp` is shared with the host.** Workspace paths must be valid on the host filesystem, not only inside the app container. Do not use paths outside `/tmp` for volume mounts.

**Column introspection is automatic.** You don't need to touch the frontend when a new tool produces a new combination of populated fields — `available_columns()` handles it. Only add to `ALL_COLUMNS` in `store.py` if you're introducing a genuinely new field to the `Finding` schema.

---

## Running Tests

There is currently no automated test suite. When testing manually:

1. Build and start the stack: `docker compose up --build`
2. Upload a sample ZIP to each category with each tool.
3. Verify findings appear and are correctly attributed (tool name, scan_type, severity).
4. Verify CSV export includes the expected columns.
5. Verify SPDX export works for Trivy and Syft scans.
6. Verify the scan log viewer shows container output.

---

## Dependency Notes

- `docker==6.1.3` and `requests>=2.28.0,<2.32.0` are pinned together. `requests>=2.32` broke the `http+docker://` socket adapter in the `docker` SDK. Do not upgrade `requests` beyond `<2.32.0` without also upgrading to a version of `docker` that supports it.
- `gitpython==3.1.43` is used for repository cloning. It shells out to the system `git` binary, which is installed in the Dockerfile.
- The frontend uses `@tanstack/react-table` for the findings table, `lucide-react` for icons, and `shadcn/ui` component primitives built on Radix UI.
