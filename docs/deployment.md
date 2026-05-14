# Deployment Guide

AppSec Toolbox is designed as a single-user local tool. This document covers running it in shared or production environments and the additional considerations that entails.

---

## Default Deployment (Local / Single-User)

Pull the published image and start with one command — no source checkout required:

```bash
curl -fsSL https://raw.githubusercontent.com/blabber-ducky/appsec-toolbox/main/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

Or pin to a specific release:

```yaml
# docker-compose.yml
image: m1v1n/appsec-toolbox:v1.0.0
```

To build from source instead:

```bash
git clone https://github.com/blabber-ducky/appsec-toolbox.git
cd appsec-toolbox
docker compose up --build -d
```

Accessible at `http://localhost:8080`. Suitable for one developer running scans on their own machine.

---

## Shared / Team Deployment

When multiple users share an instance, be aware of:

- **No authentication** — anyone who can reach port 8080 can run scans and see results. Place the service behind an authenticating reverse proxy.
- **No multi-tenancy** — results are partitioned by `session_id` (a browser-local UUID), not by user identity. A user with a different browser tab gets a different session, but there is no enforcement preventing one user from guessing another's `scan_id`.
- **Shared Docker daemon** — all scans pull and run containers on the same host daemon. A resource-hungry scan by one user affects all others.
- **Memory** — results accumulate in-process until a session starts a new scan. High scan volume from many users can exhaust server memory.

### Minimum recommended changes for shared use

1. **Put a reverse proxy in front** (nginx, Caddy, Traefik) with HTTP Basic Auth or OAuth2 proxy.
2. **Set resource limits** on the app container:

```yaml
# docker-compose.yml
services:
  appsec-toolbox:
    ...
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
```

3. **Restrict tool container resources** — add `cpu_quota` and `mem_limit` to `docker_runner.run_container`:

```python
container = client.containers.run(
    ...
    cpu_period=100000,
    cpu_quota=200000,   # 2 CPUs
    mem_limit="2g",
)
```

---

## Reverse Proxy with nginx

```nginx
server {
    listen 80;
    server_name appsec.internal;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name appsec.internal;

    ssl_certificate     /etc/ssl/certs/appsec.crt;
    ssl_certificate_key /etc/ssl/private/appsec.key;

    # WebSocket support (required for scan log streaming)
    location /api/scan/logs/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;

        # HTTP Basic Auth
        auth_basic "AppSec Toolbox";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

The WebSocket path (`/api/scan/logs/`) must be exempted from Basic Auth if your browser doesn't send credentials on WS upgrade, or use a session cookie instead.

---

## Caddy (automatic HTTPS)

```caddy
appsec.internal {
    basicauth /* {
        user $2a$14$...   # bcrypt hash from `caddy hash-password`
    }

    reverse_proxy localhost:8080 {
        header_up Host {host}
    }
}
```

Caddy handles WebSocket upgrades automatically.

---

## docker-compose.yml for Production

```yaml
services:
  appsec-toolbox:
    image: appsec-toolbox:latest   # build separately and tag
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"      # bind to loopback only; let nginx handle external traffic
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /tmp:/tmp
    environment:
      - PYTHONUNBUFFERED=1
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 8G
```

Build the image separately from the compose file to version-pin it:

```bash
docker build -t appsec-toolbox:1.0.0 .
docker tag appsec-toolbox:1.0.0 appsec-toolbox:latest
```

---

## Pre-Pulling Tool Images

Tool images are pulled on first use, which adds latency to the first scan of each tool. In Multi-Scan mode all selected tools pull concurrently at the start, so having images already cached is especially beneficial. Pre-pull at deploy time:

```bash
# Run these on the host where the app will run
docker pull m1v1n/appsec-toolbox:latest   # the app itself
docker pull semgrep/semgrep:latest
docker pull opengrep/opengrep:latest
docker pull aquasec/trivy:latest
docker pull anchore/grype:latest
docker pull anchore/syft:latest
docker pull owasp/dependency-check:latest
docker pull bridgecrew/checkov:latest
docker pull checkmarx/kics:latest
docker pull trufflesecurity/trufflehog:latest
docker pull zricethezav/gitleaks:latest
docker pull opensecurity/mobsfscan:latest
```

Add this to your deployment pipeline (CI/CD) to ensure images are always fresh.

---

## Air-Gapped / Offline Deployments

Most tools require internet access at scan time to download rule sets or vulnerability databases:

| Tool | Requires internet at scan time | Reason |
|---|---|---|
| Semgrep | Yes (by default) | Downloads `p/auto` or `p/secrets` from semgrep.dev |
| OpenGrep | Yes (by default) | Same as Semgrep |
| Trivy | Yes (first run, cached thereafter in container) | Downloads vulnerability DB from ghcr.io |
| Grype | Yes (first run) | Downloads vulnerability DB |
| Syft | No | Catalogues from image/source only |
| OWASP DC | Yes (first run) | Downloads NVD database |
| Checkov | No | All policies are bundled in the image |
| KICS | No | All queries are bundled in the image |
| TruffleHog | No (detection) / Yes (verification) | Detection is offline; live verification needs network |
| Gitleaks | No | All rules are bundled |
| MobSF | No | All rules are bundled |

### Strategy for air-gapped environments

**Option 1 — Offline Semgrep rules**

Mount a local rules directory and pass `--config /rules` instead of `--config auto`. Modify `SemgrepScanner.prepare()` to mount the rules dir and adjust the command.

**Option 2 — Pre-download Trivy/Grype DBs**

Run a one-time connected scan to populate the DB cache, then snapshot and distribute the cache via a volume or image layer.

**Option 3 — HTTP proxy**

Configure an internal HTTP proxy that can reach the required endpoints and set `HTTP_PROXY`/`HTTPS_PROXY` environment variables in the tool container via `docker_runner.run_container`.

**Option 4 — Use offline-only tools**

For fully air-gapped environments, limit the tool list to those with bundled rule sets: Checkov, KICS, Gitleaks, Syft, MobSF.

---

## Security Hardening

### Docker socket access

Mounting `/var/run/docker.sock` gives the container root-equivalent control over the host Docker daemon. Mitigations:

- **Use a Docker socket proxy** (e.g. [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)) to restrict which Docker API endpoints the app can call. Permit only: `containers/create`, `containers/start`, `containers/attach`, `containers/wait`, `containers/remove`, `images/pull`, and `events`.
- Run the app on a dedicated VM or node that is not shared with production workloads.
- Do not expose the app to the public internet without authentication.

### Upload size limits

The FastAPI default has no upload size limit. For shared deployments, add a limit:

```python
# In main.py, configure uvicorn or add middleware
from fastapi import Request
from fastapi.responses import JSONResponse

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    if request.method == "POST" and request.headers.get("content-length"):
        max_bytes = 500 * 1024 * 1024  # 500 MB
        if int(request.headers["content-length"]) > max_bytes:
            return JSONResponse(status_code=413, content={"detail": "Upload too large"})
    return await call_next(request)
```

Or enforce at the nginx layer with `client_max_body_size 500m;`.

### CORS

The default config is `allow_origins=["*"]`. For shared deployments, restrict to the actual frontend origin:

```python
# In main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://appsec.internal"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

### Scan isolation

Each scan gets an isolated temporary directory under `/tmp`. There is no cross-scan file access. Uploaded source code is mounted read-only into tool containers. Containers are removed immediately after exit.

---

## Scaling Considerations

AppSec Toolbox is not designed for high-throughput multi-user scanning. Each scan occupies a Docker container (with potentially large image pulls) and holds results in memory.

For team-scale use:
- Limit concurrent users through authentication.
- Consider deploying a separate instance per team or project.
- The in-memory store bounds itself to one scan per session, but many sessions = many results in memory. Monitor RSS on the app container.

A proper multi-user architecture would require a persistent results database (PostgreSQL), a task queue (Celery/Redis), and stateless API servers — this is out of scope for the current design.
