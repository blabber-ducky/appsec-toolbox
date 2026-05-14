from __future__ import annotations
import asyncio
import json
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile

from core import docker_runner, git_fetcher
from core.workspace import MultiScanWorkspace
from results import store
from scanner_factory import get_scanner

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/multiscan", tags=["multiscan"])

_SOURCE_TYPES = {"SAST", "SCA", "IaC", "Secrets", "Mobile"}


@router.post("/start")
async def start_multiscan(
    background_tasks: BackgroundTasks,
    configs: str = Form(...),           # JSON: [{scan_type, tool_id}, ...]
    source_input_type: str = Form("zip"),   # "zip" | "git"
    image_input_type: str = Form("image_ref"),  # "image_tar" | "image_ref"
    session_id: Optional[str] = Form(None),
    git_url: Optional[str] = Form(None),
    image_ref: Optional[str] = Form(None),
    source_file: Optional[UploadFile] = File(None),
    image_file: Optional[UploadFile] = File(None),
) -> dict:
    scan_configs: list[dict] = json.loads(configs)

    multiscan_id = str(uuid.uuid4())
    if not session_id:
        session_id = str(uuid.uuid4())

    store.purge_session(session_id)

    scan_entries = []
    for cfg in scan_configs:
        scan_id = str(uuid.uuid4())
        store.create_scan(scan_id, session_id, cfg["tool_id"], cfg["scan_type"])
        scan_entries.append({
            "scan_id": scan_id,
            "scan_type": cfg["scan_type"],
            "tool_id": cfg["tool_id"],
        })

    logger.info(
        "Multi-scan requested — multiscan_id=%s scans=%d session=%s",
        multiscan_id, len(scan_entries), session_id,
    )

    source_data = await source_file.read() if source_file else None
    image_data = await image_file.read() if image_file else None

    background_tasks.add_task(
        _run_multiscan,
        multiscan_id=multiscan_id,
        scan_entries=scan_entries,
        source_input_type=source_input_type,
        image_input_type=image_input_type,
        git_url=git_url,
        image_ref=image_ref,
        source_file_data=source_data,
        image_file_data=image_data,
    )

    return {
        "multiscan_id": multiscan_id,
        "session_id": session_id,
        "scans": scan_entries,
    }


async def _run_multiscan(
    multiscan_id: str,
    scan_entries: list[dict],
    source_input_type: str,
    image_input_type: str,
    git_url: Optional[str],
    image_ref: Optional[str],
    source_file_data: Optional[bytes],
    image_file_data: Optional[bytes],
) -> None:
    loop = asyncio.get_running_loop()
    workspace = MultiScanWorkspace(multiscan_id)
    workspace.create()

    has_source = any(e["scan_type"] in _SOURCE_TYPES for e in scan_entries)
    has_image = any(e["scan_type"] not in _SOURCE_TYPES for e in scan_entries)

    def _broadcast(msg: dict) -> None:
        for entry in scan_entries:
            loop.call_soon_threadsafe(store.log_message, entry["scan_id"], msg)

    try:
        # ── Prepare shared source ───────────────────────────────────────────
        if has_source:
            if source_input_type == "zip" and source_file_data:
                _broadcast({"type": "stage", "label": "Extracting ZIP archive", "status": "running"})
                await asyncio.to_thread(workspace.extract_zip, source_file_data)
                _broadcast({"type": "stage", "label": "Extracting ZIP archive", "status": "done"})
            elif source_input_type == "git" and git_url:
                _broadcast({"type": "stage", "label": f"Cloning {git_url}", "status": "running"})
                await asyncio.to_thread(git_fetcher.clone_repo, git_url, workspace.src)
                _broadcast({"type": "stage", "label": f"Cloning {git_url}", "status": "done"})

        # ── Prepare shared image ────────────────────────────────────────────
        if has_image:
            if image_input_type == "image_tar" and image_file_data:
                _broadcast({"type": "stage", "label": "Saving uploaded image tar", "status": "running"})
                await asyncio.to_thread(workspace.save_image_tar, image_file_data)
                _broadcast({"type": "stage", "label": "Saving uploaded image tar", "status": "done"})
            elif image_input_type == "image_ref" and image_ref:
                label = f"Pulling {image_ref} from registry"
                _broadcast({"type": "stage", "label": label, "status": "running"})

                def _img_log(msg: str) -> None:
                    for entry in scan_entries:
                        loop.call_soon_threadsafe(
                            store.log_message, entry["scan_id"],
                            {"type": "log", "message": msg},
                        )

                await asyncio.to_thread(
                    docker_runner.pull_and_save_image,
                    image_ref,
                    str(workspace.input / "image.tar.gz"),
                    _img_log,
                )
                _broadcast({"type": "stage", "label": label, "status": "done"})

        # ── Run all scans in parallel ───────────────────────────────────────
        tasks = [
            _run_one_scan(entry, workspace, loop)
            for entry in scan_entries
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    except Exception as exc:
        logger.exception("Multi-scan %s failed during input preparation: %s", multiscan_id, exc)
        for entry in scan_entries:
            state = store.get_scan(entry["scan_id"])
            if state and state.status == "pending":
                state.status = "failed"
                state.error = str(exc)
                loop.call_soon_threadsafe(
                    store.log_message, entry["scan_id"],
                    {"type": "done", "status": "failed"},
                )

    finally:
        await asyncio.to_thread(workspace.cleanup)


async def _run_one_scan(
    entry: dict,
    workspace: MultiScanWorkspace,
    loop: asyncio.AbstractEventLoop,
) -> None:
    scan_id = entry["scan_id"]
    scan_type = entry["scan_type"]
    tool_id = entry["tool_id"]

    state = store.get_scan(scan_id)
    state.status = "running"
    started_at = time.monotonic()
    active_stage: str | None = None

    def _push(msg: dict) -> None:
        loop.call_soon_threadsafe(store.log_message, scan_id, msg)

    def log(msg: str) -> None:
        _push({"type": "log", "message": msg})

    def stage(label: str, status: str = "running") -> None:
        nonlocal active_stage
        active_stage = label if status == "running" else None
        elapsed = f"{time.monotonic() - started_at:.1f}s"
        if status == "running":
            logger.info("[ms:%s] Stage started: %s", scan_id[:8], label)
        elif status == "done":
            logger.info("[ms:%s] Stage done (%s): %s", scan_id[:8], elapsed, label)
        else:
            logger.warning("[ms:%s] Stage %s: %s", scan_id[:8], status, label)
        _push({"type": "stage", "label": label, "status": status})

    sub_ws = workspace.scan_workspace(scan_id)

    try:
        scanner = get_scanner(tool_id)
        logger.info("[ms:%s] Scanner: %s (image=%s)", scan_id[:8], tool_id, scanner.image)

        stage(f"Pulling {scanner.image}")
        await asyncio.to_thread(docker_runner.pull_image, scanner.image, log)
        stage(f"Pulling {scanner.image}", "done")

        volumes, command = scanner.prepare(sub_ws, scan_type=scan_type)
        logger.info("[ms:%s] command=%r network=%s", scan_id[:8], command, scanner.network_mode)

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
            log(f"WARNING: Scanner exited with code {exit_code} — results may be incomplete.")
        stage(f"Running {tool_id} scan", "done")

        stage("Parsing results")
        findings = await asyncio.to_thread(scanner.parse_output, str(sub_ws.out))
        state.findings = findings
        state.columns = store.available_columns(findings)
        state.status = "complete"
        logger.info(
            "[ms:%s] Complete — findings=%d elapsed=%.1fs",
            scan_id[:8], len(findings), time.monotonic() - started_at,
        )
        stage("Parsing results", "done")

        if scanner.supports_spdx:
            spdx_result = scanner.prepare_spdx(sub_ws)
            if spdx_result:
                spdx_command, spdx_volumes = spdx_result
                stage("Generating SPDX SBOM")
                try:
                    sub_ws.clear_out()
                    await asyncio.to_thread(
                        docker_runner.run_container,
                        scanner.image, spdx_command, spdx_volumes, log,
                    )
                    spdx_path = sub_ws.out / "sbom.spdx.json"
                    if spdx_path.exists():
                        state.spdx_content = spdx_path.read_text()
                        stage("Generating SPDX SBOM", "done")
                    else:
                        log("WARNING: SPDX container produced no output file.")
                        stage("Generating SPDX SBOM", "error")
                except Exception as exc:
                    log(f"WARNING: SPDX generation failed: {exc}")
                    stage("Generating SPDX SBOM", "error")

    except Exception as exc:
        state.status = "failed"
        state.error = str(exc)
        logger.exception("[ms:%s] Scan failed: %s", scan_id[:8], exc)
        if active_stage:
            stage(active_stage, "error")
        log(f"ERROR: {exc}")

    finally:
        _push({"type": "done", "status": state.status})
