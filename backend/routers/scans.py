from __future__ import annotations
import asyncio
import uuid
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, File, Form, HTTPException,
    UploadFile, WebSocket, WebSocketDisconnect,
)

from core import workspace as ws_mod
from core import docker_runner, git_fetcher
from results import store
from scanner_factory import get_scanner

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

    # Purge any previous scan for this session before starting a new one
    store.purge_session(session_id)
    store.create_scan(scan_id, session_id, tool_id, scan_type)

    # Read file bytes before handing off — UploadFile is not safe across tasks
    file_data: bytes | None = None
    if file:
        file_data = await file.read()

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

    def log(msg: str) -> None:
        message = {"type": "log", "message": msg}
        loop.call_soon_threadsafe(store.log_message, scan_id, message)

    workspace = ws_mod.Workspace(scan_id)
    workspace.create()

    try:
        # ── Prepare input ───────────────────────────────────────────────────
        if input_type == "zip" and file_data:
            log("Extracting ZIP archive...")
            await asyncio.to_thread(workspace.extract_zip, file_data)

        elif input_type == "git" and git_url:
            log(f"Cloning repository: {git_url}")
            await asyncio.to_thread(git_fetcher.clone_repo, git_url, workspace.src)

        elif input_type == "image_tar" and file_data:
            log("Saving uploaded image tar...")
            await asyncio.to_thread(workspace.save_image_tar, file_data)

        elif input_type == "image_ref" and image_ref:
            log(f"Pulling image '{image_ref}' from registry...")
            await asyncio.to_thread(
                docker_runner.pull_and_save_image,
                image_ref,
                str(workspace.input / "image.tar.gz"),
                log,
            )

        else:
            raise ValueError(f"Invalid input combination: type={input_type}")

        # ── Pull tool image ─────────────────────────────────────────────────
        scanner = get_scanner(tool_id)
        await asyncio.to_thread(docker_runner.pull_image, scanner.image, log)

        # ── Run scan container ──────────────────────────────────────────────
        volumes, command = scanner.prepare(workspace, input_type=input_type, image_ref=image_ref)
        log(f"Starting {tool_id} scan...")
        exit_code = await asyncio.to_thread(
            docker_runner.run_container,
            scanner.image,
            command,
            volumes,
            log,
        )
        # Exit code 1 is normal for many scanners when findings are present
        if exit_code not in (0, 1):
            log(f"WARNING: Scanner exited with code {exit_code} — results may be incomplete.")

        # ── Parse results ───────────────────────────────────────────────────
        log("Parsing scan output...")
        findings = await asyncio.to_thread(scanner.parse_output, str(workspace.out))
        state.findings = findings
        state.columns = store.available_columns(findings)
        state.status = "complete"
        log(f"Scan complete — {len(findings)} finding(s) found.")

        # ── SPDX generation (optional, non-fatal) ──────────────────────────
        if scanner.supports_spdx:
            spdx_result = scanner.prepare_spdx(workspace)
            if spdx_result:
                spdx_command, spdx_volumes = spdx_result
                log("Generating SPDX SBOM...")
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
                        log("SPDX SBOM generated.")
                    else:
                        log("WARNING: SPDX file not produced.")
                except Exception as exc:
                    log(f"WARNING: SPDX generation failed — {exc}")

    except Exception as exc:
        state.status = "failed"
        state.error = str(exc)
        log(f"ERROR: {exc}")

    finally:
        done_msg = {"type": "done", "status": state.status}
        loop.call_soon_threadsafe(store.log_message, scan_id, done_msg)
        await asyncio.to_thread(workspace.cleanup)


@router.websocket("/logs/{scan_id}")
async def scan_logs(websocket: WebSocket, scan_id: str) -> None:
    await websocket.accept()

    state = store.get_scan(scan_id)
    queue = store.get_log_queue(scan_id)

    if not state or not queue:
        await websocket.close(code=1008)
        return

    try:
        # Replay any logs that arrived before the WebSocket connected
        for msg in list(state.logs):
            await websocket.send_json(msg)

        # If already done, we're finished after the replay
        if state.status in ("complete", "failed"):
            await websocket.send_json({"type": "done", "status": state.status})
            return

        # Stream live until the done sentinel
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
        pass
    finally:
        await websocket.close()
