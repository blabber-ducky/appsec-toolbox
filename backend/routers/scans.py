from __future__ import annotations
import asyncio
import logging
import time
import uuid
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, File, Form,
    UploadFile, WebSocket, WebSocketDisconnect,
)

from core import workspace as ws_mod
from core import docker_runner, git_fetcher
from results import store
from scanner_factory import get_scanner

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scan", tags=["scans"])


@router.post("/start")
async def start_scan(
    background_tasks: BackgroundTasks,
    scan_type: str = Form(...),
    tool_id: str = Form(...),
    input_type: str = Form(...),
    session_id: Optional[str] = Form(None),
    git_url: Optional[str] = Form(None),
    image_ref: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
) -> dict:
    scan_id = str(uuid.uuid4())
    if not session_id:
        session_id = str(uuid.uuid4())

    logger.info(
        "Scan requested — scan_id=%s tool=%s type=%s input=%s session=%s",
        scan_id, tool_id, scan_type, input_type, session_id,
    )

    store.purge_session(session_id)
    store.create_scan(scan_id, session_id, tool_id, scan_type)

    file_data: bytes | None = None
    if file:
        file_data = await file.read()
        logger.info("Upload received — filename=%s size=%d bytes", file.filename, len(file_data))

    background_tasks.add_task(
        _run_scan,
        scan_id=scan_id,
        session_id=session_id,
        scan_type=scan_type,
        tool_id=tool_id,
        input_type=input_type,
        git_url=git_url,
        image_ref=image_ref,
        file_data=file_data,
    )
    return {"scan_id": scan_id, "session_id": session_id}


async def _run_scan(
    scan_id: str,
    session_id: str,
    scan_type: str,
    tool_id: str,
    input_type: str,
    git_url: Optional[str],
    image_ref: Optional[str],
    file_data: Optional[bytes],
) -> None:
    loop = asyncio.get_running_loop()
    state = store.get_scan(scan_id)
    state.status = "running"
    active_stage: str | None = None
    started_at = time.monotonic()

    def _push(msg: dict) -> None:
        loop.call_soon_threadsafe(store.log_message, scan_id, msg)

    def log(msg: str) -> None:
        _push({"type": "log", "message": msg})

    def stage(label: str, status: str = "running") -> None:
        nonlocal active_stage
        active_stage = label if status == "running" else None
        elapsed = f"{time.monotonic() - started_at:.1f}s"
        if status == "running":
            logger.info("[%s] Stage started: %s", scan_id[:8], label)
        elif status == "done":
            logger.info("[%s] Stage done (%s): %s", scan_id[:8], elapsed, label)
        else:
            logger.warning("[%s] Stage %s: %s", scan_id[:8], status, label)
        _push({"type": "stage", "label": label, "status": status})

    def log_warning(msg: str) -> None:
        logger.warning("[%s] %s", scan_id[:8], msg)
        log(f"WARNING: {msg}")

    workspace = ws_mod.Workspace(scan_id)
    workspace.create()

    try:
        # ── Prepare input ───────────────────────────────────────────────────
        if input_type == "zip" and file_data:
            stage("Extracting ZIP archive")
            await asyncio.to_thread(workspace.extract_zip, file_data)
            stage("Extracting ZIP archive", "done")

        elif input_type == "git" and git_url:
            stage(f"Cloning {git_url}")
            await asyncio.to_thread(git_fetcher.clone_repo, git_url, workspace.src)
            stage(f"Cloning {git_url}", "done")

        elif input_type == "image_tar" and file_data:
            stage("Saving uploaded image tar")
            await asyncio.to_thread(workspace.save_image_tar, file_data)
            stage("Saving uploaded image tar", "done")

        elif input_type == "image_ref" and image_ref:
            stage(f"Pulling {image_ref} from registry")
            await asyncio.to_thread(
                docker_runner.pull_and_save_image,
                image_ref,
                str(workspace.input / "image.tar.gz"),
                log,
            )
            stage(f"Pulling {image_ref} from registry", "done")

        else:
            raise ValueError(
                f"Invalid input combination: input_type='{input_type}', "
                f"file={'yes' if file_data else 'no'}, "
                f"git_url={git_url!r}, image_ref={image_ref!r}"
            )

        # ── Pull tool image ─────────────────────────────────────────────────
        scanner = get_scanner(tool_id)
        logger.info("[%s] Scanner: %s (image=%s)", scan_id[:8], tool_id, scanner.image)
        stage(f"Pulling {scanner.image}")
        await asyncio.to_thread(docker_runner.pull_image, scanner.image, log)
        stage(f"Pulling {scanner.image}", "done")

        # ── Run scan container ──────────────────────────────────────────────
        volumes, command = scanner.prepare(workspace, input_type=input_type, image_ref=image_ref, scan_type=scan_type)
        logger.info(
            "[%s] Running scanner container — command=%r network=%s",
            scan_id[:8], command, scanner.network_mode,
        )
        stage(f"Running {tool_id} scan")
        exit_code = await asyncio.to_thread(
            docker_runner.run_container,
            scanner.image,
            command,
            volumes,
            log,
            scanner.network_mode,
            None,
            scanner.entrypoint,
        )
        if exit_code not in (0, 1):
            log_warning(
                f"Scanner exited with code {exit_code} — results may be incomplete or the tool "
                "encountered an internal error. Check the scanner output above for details."
            )
        stage(f"Running {tool_id} scan", "done")

        # ── Parse results ───────────────────────────────────────────────────
        stage("Parsing results")
        findings = await asyncio.to_thread(scanner.parse_output, str(workspace.out))
        if not findings:
            logger.info("[%s] No findings parsed — output dir: %s", scan_id[:8], workspace.out)
        state.findings = findings
        state.columns = store.available_columns(findings)
        state.status = "complete"
        elapsed_total = time.monotonic() - started_at
        logger.info(
            "[%s] Scan complete — findings=%d elapsed=%.1fs",
            scan_id[:8], len(findings), elapsed_total,
        )
        stage("Parsing results", "done")

        # ── SPDX generation (optional, non-fatal) ──────────────────────────
        if scanner.supports_spdx:
            spdx_result = scanner.prepare_spdx(workspace)
            if spdx_result:
                spdx_command, spdx_volumes = spdx_result
                stage("Generating SPDX SBOM")
                try:
                    workspace.clear_out()
                    await asyncio.to_thread(
                        docker_runner.run_container,
                        scanner.image,
                        spdx_command,
                        spdx_volumes,
                        log,
                    )
                    spdx_path = workspace.out / "sbom.spdx.json"
                    if spdx_path.exists():
                        state.spdx_content = spdx_path.read_text()
                        logger.info("[%s] SPDX SBOM generated (%d bytes)", scan_id[:8], len(state.spdx_content))
                        stage("Generating SPDX SBOM", "done")
                    else:
                        logger.warning("[%s] SPDX container ran but produced no output file", scan_id[:8])
                        log_warning("SPDX container ran but produced no output file at /out/sbom.spdx.json.")
                        stage("Generating SPDX SBOM", "error")
                except Exception as exc:
                    logger.exception("[%s] SPDX generation failed: %s", scan_id[:8], exc)
                    log_warning(f"SPDX generation failed: {exc}")
                    stage("Generating SPDX SBOM", "error")

    except Exception as exc:
        state.status = "failed"
        state.error = str(exc)
        elapsed_total = time.monotonic() - started_at
        logger.exception(
            "[%s] Scan failed after %.1fs — tool=%s input=%s: %s",
            scan_id[:8], elapsed_total, tool_id, input_type, exc,
        )
        if active_stage:
            stage(active_stage, "error")
        log(f"ERROR: {exc}")

    finally:
        _push({"type": "done", "status": state.status})
        await asyncio.to_thread(workspace.cleanup)


@router.websocket("/logs/{scan_id}")
async def scan_logs(websocket: WebSocket, scan_id: str) -> None:
    await websocket.accept()
    logger.debug("WebSocket connected for scan %s", scan_id[:8])

    state = store.get_scan(scan_id)
    queue = store.get_log_queue(scan_id)

    if not state or not queue:
        logger.warning("WebSocket request for unknown scan_id=%s", scan_id)
        await websocket.close(code=1008)
        return

    try:
        buffered = list(state.logs)
        if buffered:
            logger.debug("Replaying %d buffered messages to late WebSocket client", len(buffered))
        for msg in buffered:
            await websocket.send_json(msg)

        if state.status in ("complete", "failed"):
            await websocket.send_json({"type": "done", "status": state.status})
            return

        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue
            await websocket.send_json(msg)
            if msg.get("type") == "done":
                break

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected for scan %s", scan_id[:8])
    finally:
        await websocket.close()
