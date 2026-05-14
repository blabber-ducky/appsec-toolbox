# User Guide

AppSec Toolbox is a web-based security scanning hub. You point it at source code or a container image and it runs the scanner of your choice, streaming live output and presenting normalized findings in a sortable table.

There are two modes: **Single Scan** (one category, one tool, one result set) and **Multi-Scan** (multiple categories and tools running in parallel, tabbed results).

---

## Navigating the UI

**Single scan** walks you through a four-step wizard: **scan type → tool → input → results**. A breadcrumb trail at the top lets you jump backwards. If you already have results loaded, you'll be asked to confirm before the current data is cleared.

**Multi-Scan** has its own four-step wizard accessed via the **Multi-Scan** card at the bottom of the home screen: **select types → provide input → select tools → results**.

---

## Single Scan

### Step 1 — Choose a Scan Category

The home screen shows six category cards. Pick the one that matches what you want to analyze.

| Category | What it finds | What it needs |
|---|---|---|
| **SAST** | Insecure code patterns, logic bugs | Source code (ZIP or Git) |
| **SCA** | Known CVEs in third-party dependencies | Source code with lock files |
| **IaC** | Cloud/infrastructure misconfigurations | Terraform, Kubernetes, Helm, Dockerfile, etc. |
| **Secrets** | Hardcoded credentials, API keys, tokens | Source code (ZIP or Git) |
| **Build** | OS and library CVEs inside a container image | Docker image (tar.gz or registry ref) |
| **Mobile** | Insecure patterns in Android/iOS source code | Source code (ZIP) |

---

## Step 2 — Select a Tool (single scan)

Each category offers one or more tools. Tools labeled **Recommended** are good choices if you have no specific preference.

Hover the **info icon** on any tool to read a description of what it does and how it differs from alternatives in the same category.

The **SPDX** badge appears on tools that can also generate a Software Bill of Materials in SPDX format — useful for downstream supply-chain tooling.

Multi-category tools (e.g. Trivy, Semgrep) appear in every category they support. The correct scanner command is selected automatically based on which category you chose.

---

## Step 3 — Provide Input (single scan)

### Source code

**ZIP upload** — compress your project root:

```bash
zip -r my-project.zip .
```

Include lock files and dependency manifests for the best SCA results (`package-lock.json`, `requirements.txt`, `go.sum`, `pom.xml`, `Cargo.lock`, etc.).

**Git URL** — paste any HTTPS Git URL. The server clones the repository at scan time. Private repositories are not supported unless your server can reach them without authentication.

### Container images (Build scans)

**Image tar.gz** — export a local image:

```bash
docker save my-image:tag | gzip > image.tar.gz
```

Then upload the resulting file.

**Registry reference** — type an image name such as `nginx:latest` or `python:3.12-slim`. The server pulls the image from the registry and saves it before scanning.

---

## Step 4 — Watch the Scan Run (single scan)

The scan runs in a container on the server. Log output streams live to your browser over a WebSocket connection. You'll see:

- **Stage markers** (with ✓ / ✗ indicators) showing which phase the scan is in
- **Raw container output** from the tool (pull progress, rule loading messages, etc.)
- **Warnings** if the scanner exits with a non-zero code

The progress bar advances as stages complete. The scan finishes when you see "Parsing results."

---

---

## Multi-Scan

Multi-Scan lets you run any combination of scan types simultaneously against the same codebase or container image. Results from all scans appear in a single tabbed view when all scanners finish.

### Step 1 — Select scan types

Click **Multi-Scan** on the home screen. A checkbox grid shows all six scan categories. Select two or more and click **Continue**.

Types are grouped by their input requirement:

| Input kind | Scan types |
|---|---|
| Source code (ZIP or Git URL) | SAST, SCA, IaC, Secrets, Mobile |
| Container image (tar.gz or registry ref) | Build |

If you select only source-based types you'll only be asked for source code. If you include Build you'll also be asked for an image — both inputs are collected in the same step.

### Step 2 — Provide input

The input panel shows only the sections you need:

- **Source code section** — appears when any source-based scan type is selected. Toggle between ZIP upload and Git URL using the tab at the top of the section.
- **Container image section** — appears when Build is selected. Toggle between uploading a `.tar.gz` and providing a registry reference.

Prepare your inputs:

```bash
# Source code ZIP
zip -r my-project.zip .

# Container image tar.gz
docker save my-image:tag | gzip > image.tar.gz
```

### Step 3 — Select tools

One tool picker appears per selected scan type, each with its own section header showing the scan category. Pick one scanner per type. Tools marked **Recommended** are sensible defaults.

Click **Start N parallel scans** when all types have a tool selected.

### Step 4 — Watch scans run in parallel

The running screen shows a panel for each scan. All panels start simultaneously — you do not wait for one to finish before the next begins. Each panel shows:

- The scan type badge and tool name
- Live stage progress (pull image → run scan → parse results)
- A collapsible terminal output log for that scan specifically

The screen advances to results automatically once every scan has finished (complete or failed).

### Step 5 — Tabbed results

Results are presented in tabs across the top of the page — one tab per scan type. Each tab shows:

- **Finding count** badge (amber = findings present, gray = clean, red = scan failed)
- The full **results table** with severity filter, sorting, and expandable rows
- **Export CSV** — downloads findings for that tab only, respecting your column selection
- **Export SPDX** — available on tabs where the tool produced an SBOM (Trivy, Syft)
- **Scan Logs** — opens the full container output for that specific scan

Switching between tabs does not lose your column selection for other tabs.

---

## Results Table

Once the scan completes you land on the full-page results view.

### Severity filter

Click any severity pill at the top of the table to filter to that level. Click again to clear the filter. Severity levels from most to least severe: **CRITICAL → HIGH → MEDIUM → LOW → INFO → UNKNOWN**.

### Sorting

Click any column header to sort ascending; click again to sort descending.

### Expanding a row

Click the **›** chevron on the left of any row to expand it. The expanded row shows:
- Full description from the scanner
- File location (for code findings) or package version (for dependency findings)
- References / advisory links
- Collapsible raw JSON from the scanner output

### Column selection

Click **Columns** to open a picker. Only columns that contain data for this scan are listed — if the scanner didn't emit CVE IDs, the CVE column won't appear. Toggle columns on or off; the table updates immediately. Your selection is used for CSV export.

---

## Exporting Results

### CSV

Click **Export CSV** to download a spreadsheet containing the columns currently visible in your column selection. The file is named `appsec-<tool>-<scan-id-prefix>.csv`.

### SPDX SBOM

Available only when the scanned tool produced a software bill of materials (Trivy SCA, Trivy Build, Syft). Click **Export SPDX** to download an `sbom.spdx.json` file suitable for ingestion into vulnerability management platforms.

---

## Scan Logs

Click **Scan Logs** on the results page to open a dialog showing the full buffered output from the container. This is useful for diagnosing why a scan produced no results or for understanding what rule sets the tool loaded.

Log lines are color-coded:
- **Red** — ERROR messages
- **Yellow** — WARNING messages
- **Blue** — Docker engine messages (pull progress, container events)
- **Green** — standard tool output

---

## Understanding Findings

Every finding has the same normalized structure regardless of which tool produced it.

| Field | Description |
|---|---|
| Severity | CRITICAL, HIGH, MEDIUM, LOW, INFO, or UNKNOWN |
| Title | Short name of the finding or vulnerability |
| Location | File path + line number (code), or package@version (dependency) |
| Rule / Check | The rule ID, check name, or CVE that triggered the finding |
| CVE ID | CVE identifier, populated for SCA and Build scans |
| Fix Version | The dependency version that resolves the CVE |
| Description | Full explanation from the scanner |
| References | Advisory links, proof-of-concept URLs, documentation |
| Tool | Which scanner produced this finding |

---

## Tool Reference

### SAST

#### Semgrep (Recommended)
Finds bugs and security issues using pattern-matching rules. Supports 30+ languages and auto-detects your stack. Best for Python, JavaScript/TypeScript, Go, Java, Ruby, PHP, C/C++.

#### OpenGrep
Open-source continuation of Semgrep OSS with no proprietary telemetry. Compatible with the Semgrep rule ecosystem.

---

### SCA

#### Trivy (Recommended)
Scans dependency manifests and lock files for known CVEs. Covers npm, pip, Maven, Go modules, Cargo, Composer, and more. Also generates SPDX SBOMs.

#### Grype
Anchore's vulnerability scanner. Offline-capable vulnerability database sourced from NVD, GHSA, and OS vendor advisories. Pairs naturally with Syft.

#### Syft (SBOM)
Generates a Software Bill of Materials listing every dependency, version, license, and PURL. Results appear as INFO findings (no severity — this is an inventory tool). Exports SPDX SBOM.

#### OWASP Dependency Check
Long-established tool excelling at Java/Maven/Gradle and .NET. The first run downloads the NVD data (~200 MB, 2–5 minutes); subsequent scans reuse the cache.

---

### IaC

#### Checkov (Recommended)
Scans Terraform, CloudFormation, Kubernetes, Helm, Dockerfile, Serverless, and ARM templates. 1,000+ built-in policies mapped to CIS, NIST, PCI-DSS, SOC2, and HIPAA benchmarks.

#### Checkmarx KICS
Covers 2,000+ queries across Terraform (AWS/GCP/Azure), Kubernetes, Docker, and Helm. Good complement to Checkov.

#### Trivy
Uses the Aqua AVD policy library to detect misconfigurations in IaC files — a lighter-weight alternative if Trivy is already in your workflow.

---

### Secrets

#### TruffleHog (Recommended)
700+ detectors covering cloud providers, SaaS APIs, databases, and private keys. Uniquely performs **live verification** — actively tests found credentials to confirm they are still valid. Verified secrets are marked CRITICAL; unverified matches are HIGH.

#### Gitleaks
Detects hardcoded secrets using a comprehensive regex ruleset plus entropy analysis. Covers AWS, GCP, GitHub, Slack, Stripe, and hundreds more. Reports show the file, line number, and matched rule (secrets are not echoed in full).

#### Semgrep
Runs the `p/secrets` ruleset targeting API keys, passwords, and credentials. Use this when you want secret detection only, without the broader code-quality rules from the SAST category.

---

### Build

#### Trivy (Recommended)
Scans Docker images for OS package CVEs (Alpine, Debian, Ubuntu, RHEL, CentOS) and application dependency vulnerabilities. Industry-standard for container security scanning. Exports SPDX SBOM.

#### Grype
Anchore's image scanner. A lighter-weight alternative to Trivy for teams already using the Anchore toolchain.

#### Syft (Image SBOM)
Generates a layer-by-layer inventory of every OS package and application dependency in a Docker image. Exports SPDX SBOM for downstream vulnerability scanning.

---

### Mobile

#### MobSF / mobsfscan (Recommended)
Static analysis engine from Mobile Security Framework. Detects insecure code patterns in Android (Java, Kotlin, XML) and iOS (Swift, Objective-C) source code. Findings are mapped to OWASP Mobile Top 10 and MASVS.

---

## Tips and Limitations

- Results are held in memory only. **Closing the browser tab or restarting the server clears all results.** Export before you navigate away.
- The first scan of each tool pulls its Docker image — expect 1–5 minutes on first use.
- OWASP Dependency Check downloads the NVD database on first run (~200 MB); this can take several minutes.
- For SCA scans, include **lock files** in your ZIP (`package-lock.json`, `yarn.lock`, `go.sum`, etc.). Trivy and Grype read these for accurate version pinning.
- For IaC scans, include the complete IaC directory tree. Checkov and KICS auto-detect framework types across subdirectories.
- Git URL clones are shallow but include all files. Authentication is not supported; only public repositories work.
