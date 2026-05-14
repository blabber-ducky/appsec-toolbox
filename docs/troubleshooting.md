# Troubleshooting

---

## Docker and Container Issues

### "Cannot connect to the Docker daemon" / "Failed to connect to Docker daemon"

The app container can't reach the host Docker daemon.

**Check the socket mount**

```bash
docker compose ps       # confirm the container is running
docker inspect appsec-toolbox | grep -A5 Mounts
# should show /var/run/docker.sock mounted
```

**Check permissions**

The process inside the container must have permission to use the socket. Either:
- Run with `user: root` in `docker-compose.yml` (simplest for local use), or
- Add the container user to the `docker` group (`groupadd -g $(stat -c %g /var/run/docker.sock) docker && usermod -aG docker appuser`)

---

### "Not supported URL scheme http+docker" / Docker SDK connection errors

This happens when `requests>=2.32` is installed. The Docker Python SDK 6.x uses a custom `http+docker://` URL adapter that `requests` 2.32 removed.

**Fix**: The `requirements.txt` pins `docker==6.1.3` and `requests>=2.28.0,<2.32.0`. If you've manually upgraded `requests`, revert it:

```bash
pip install "requests>=2.28.0,<2.32.0"
```

Do not upgrade `requests` past `<2.32.0` unless you also upgrade the `docker` SDK to a version that supports it.

---

### Tool image pull fails / "image not found"

If an image name is wrong or the registry is unreachable:

- Check that the image name in `tools.yaml` is correct and the tag exists.
- Ensure the app container has outbound internet access (it needs to reach `registry-1.docker.io` and other registries).
- For private registries, pre-authenticate on the host: `docker login <registry>`. Credentials are stored in `~/.docker/config.json`, which the Docker daemon uses automatically.

---

### Scan produces no findings but the container ran successfully

1. Click **Scan Logs** on the results page and inspect the raw container output.
2. Check whether the tool wrote `results.json` — if the output dir is empty, the tool may have written to stdout instead of a file (see [adding a stdout-only tool](developer-guide.md#stdout-only-tools)).
3. Some tools exit `1` when they find issues (non-zero doesn't always mean error). The app treats exit codes `0` and `1` as normal; anything else generates a warning.
4. Verify your ZIP includes the files the scanner needs. SCA tools need lock files; IaC tools need the actual IaC source files.

---

### Scanner exits with unexpected code / "results may be incomplete"

A warning banner appears when the scanner exits with a code other than `0` or `1`. Common causes:

| Tool | Common non-zero codes |
|---|---|
| Semgrep | `2` = config error (bad rule config or no `--config` target found) |
| Checkov | `1` = policy violation (expected); other codes = internal error |
| TruffleHog | Non-zero if it can't access the scan target |
| OWASP DC | `1` = found vulnerabilities; other codes = NVD download failed |

Open Scan Logs to see the full container output and identify the root cause.

---

### OWASP Dependency Check is very slow on first run

Expected behaviour. OWASP DC downloads the NVD vulnerability database (~200 MB) the first time it runs. This can take 2–5 minutes depending on your connection. Subsequent scans reuse a cached copy.

The cache lives inside the container and is discarded when the container is removed (which happens after every scan). To persist the cache between scans you would need to mount a named volume at `/root/.dependency-check/data` — this is not currently wired up, but can be added to `docker-compose.yml` if needed.

---

## Network Issues Inside Tool Containers

### "Failed to resolve 'semgrep.dev'" / "network is unreachable"

Tool containers run with `network_mode=bridge` so they can:
- Download Semgrep rule sets from `semgrep.dev`
- Download the Trivy vulnerability DB from `ghcr.io`
- Perform TruffleHog's live credential verification

If you're running in an air-gapped or proxy environment:

**Option 1 — Pre-pull and cache vulnerability databases**

For Trivy, mount a pre-populated DB cache. Run once with network access, then copy the cache to the expected path.

**Option 2 — HTTP proxy**

Add proxy environment variables to the tool container via the scanner's `prepare()` method:

```python
# In docker_runner.run_container, the environment dict is passed to the container
environment = {
    "HTTP_PROXY": "http://proxy.internal:3128",
    "HTTPS_PROXY": "http://proxy.internal:3128",
    "NO_PROXY": "localhost,127.0.0.1",
}
```

Wire this through `BaseScanner` by overriding a `environment` property or by setting it in `docker_runner.run_container` for all containers.

**Option 3 — Use offline-capable tools**

Grype (for SCA) has an offline mode using a pre-downloaded DB. Gitleaks and Checkov run entirely offline.

---

## Input Issues

### "The uploaded file is not a valid ZIP archive"

The server validates the upload before extraction. Common causes:
- The file was renamed to `.zip` but is actually a different format (`.tar.gz`, `.tar`, etc.).
- The ZIP was created on Windows with a tool that uses a non-standard format — try `zip -r archive.zip .` from a Unix shell.
- The upload was truncated (browser timeout or file size limit).

---

### "Unsafe ZIP entry would extract outside the target directory"

The ZIP contains entries with absolute paths or `..` path components (zip-slip attack). Re-create the archive without absolute paths:

```bash
cd your-project/
zip -r ../archive.zip .
```

---

### Git clone fails / "Repository not found"

- Only HTTPS URLs are supported. SSH (`git@github.com:...`) will fail.
- Private repositories require authentication — not currently supported. Clone the repo locally and upload a ZIP instead.
- Very large repositories may time out. Clone locally and ZIP the relevant subdirectory.

---

### Image tar.gz upload fails / image scan produces no results

- The file must be a **gzipped tar** (`docker save ... | gzip`), not a plain `.tar`.
- Trivy and Grype expect `image.tar.gz` — ensure the file is gzip-compressed.
- Some image export tools produce non-standard layouts. If the scan fails, try re-exporting with `docker save <image> | gzip > image.tar.gz`.

---

## Frontend Issues

### Results table shows "Loading results…" indefinitely

The `GET /api/results/{scan_id}` poll is returning a non-200 response. Open browser DevTools (Network tab) and look for the failing request.

Common cause: the scan failed before creating a results record. Check `GET /api/results/{scan_id}` directly — if it returns 404, the scan ID is missing from the store (the server may have restarted, which clears all in-memory state).

---

### Severity filter causes a crash / blank screen

Ensure the React version running is the one built by `npm run build`. A stale build in `backend/static/` can serve old code. Rebuild:

```bash
docker compose up --build
```

If developing locally, ensure the Vite dev server is running and the browser is pointed at `http://localhost:5173`, not the backend port.

---

### SPDX export button doesn't appear

The **Export SPDX** button is only shown when `has_spdx: true` in the results response. This requires:
1. The selected tool supports SPDX (Trivy SCA, Trivy Build, Syft).
2. The SPDX generation container ran successfully.

If you selected a SPDX-capable tool but the button is missing, open Scan Logs and look for the "Generating SPDX SBOM" stage — a `✗` marker or `WARNING` message there indicates the SPDX container failed silently.

---

## Server Restart Clears All Results

This is by design. Results are stored in-process memory only. If you need persistent results across restarts:
- Export CSV or SPDX before stopping the server.
- Or implement a persistent results backend (see [architecture.md](architecture.md) for the `ScanState` schema).

---

## Debugging Tips

### Enable verbose backend logging

The backend logs at `INFO` level by default. All scanner commands, container IDs, exit codes, and parse results are logged. View them with:

```bash
docker compose logs -f appsec-toolbox
```

### Inspect a scanner container manually

To run a tool container with the same setup the app would use:

```bash
docker run --rm \
  -v /path/to/source:/src:ro \
  -v /tmp/out:/out:rw \
  semgrep/semgrep:latest \
  semgrep scan --json --output /out/results.json --config auto /src
```

Then inspect `/tmp/out/results.json` directly.

### Check what the normalizer receives

Add a temporary `logger.debug("raw data: %s", json.dumps(data)[:2000])` line in the scanner's `parse_output()` to dump the raw JSON. Remove before committing.
