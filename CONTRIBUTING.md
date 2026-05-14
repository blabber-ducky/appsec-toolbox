# Contributing

## Getting Started

```bash
git clone <repo-url> appsec-toolbox
cd appsec-toolbox

# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
# http://localhost:5173 → proxies /api/* to :8000
```

You need Docker running on the host — the backend talks to the host daemon via `/var/run/docker.sock`.

---

## Before You Submit

1. **TypeScript build must pass** — `cd frontend && npm run build`. No type errors.
2. **New tools need a normalizer** — every scanner must emit `Finding` objects. See [docs/developer-guide.md](docs/developer-guide.md#adding-a-new-tool).
3. **No dead code** — if you remove something, delete it completely.
4. **No comments explaining what the code does** — only add a comment when the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant).

---

## Commit Style

One logical change per commit. Subject line in imperative mood, no trailing period:

```
Add Grype normalizer for SCA and Build scan types
Fix severity filter crash: use keyed React.Fragment for row pairs
Map multi-category tools and add recommended highlights
```

Not:

```
added grype
Fixed a bug in ResultsTable.tsx
Various improvements
```

---

## What Needs Testing

There is no automated test suite. When adding a scanner or changing the scan pipeline, manually verify:

- [ ] The tool card appears in the UI under the correct category
- [ ] The scan runs end-to-end and produces findings
- [ ] Findings have correct `severity`, `scan_type`, `tool`, and `location`
- [ ] CSV export includes expected columns
- [ ] SPDX export works (if `supports_spdx: true`)
- [ ] Scan log viewer shows full container output
- [ ] Switching scan type or tool from the results page clears the previous results

---

## Key Rules

| Rule | Why |
|---|---|
| `Finding` schema is a contract — never remove fields | Frontend, CSV export, and SPDX export all depend on the schema |
| `scanner_factory.get_scanner()` creates a new instance per scan | Instance state (`_scan_mode`) must not be shared between concurrent scans |
| Workspace paths must be valid on the host | Tool containers are launched by the host daemon; `/tmp` bind-mount is what makes paths work on both sides |
| `scan_type` must flow end-to-end | It's passed from the frontend → `POST /scan/start` → `scanner.prepare()` → `parse_output()` |
| Column list is derived from data, not hardcoded | `available_columns()` filters at result time; the frontend renders from the API response |

---

## Reporting Issues

Open an issue describing:
- What you were doing (scan type, tool, input type)
- What you expected to happen
- What actually happened (include backend logs: `docker compose logs appsec-toolbox`)
- The raw scanner output if relevant (from the Scan Logs dialog)
