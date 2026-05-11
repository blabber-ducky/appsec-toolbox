from __future__ import annotations
from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from results import store, exporter

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{scan_id}")
async def get_results(scan_id: str) -> dict:
    state = store.get_scan(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {
        "scan_id": scan_id,
        "status": state.status,
        "error": state.error,
        "tool_id": state.tool_id,
        "scan_type": state.scan_type,
        "total": len(state.findings),
        "findings": [f.to_dict() for f in state.findings],
        "columns": [asdict(c) for c in state.columns],
        "has_spdx": state.spdx_content is not None,
    }


@router.get("/{scan_id}/logs")
async def get_scan_logs(scan_id: str) -> dict:
    state = store.get_scan(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {"scan_id": scan_id, "logs": state.logs}


@router.get("/{scan_id}/export/csv")
async def export_csv(scan_id: str, columns: str = "") -> StreamingResponse:
    state = store.get_scan(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found")

    if columns:
        col_keys = set(columns.split(","))
        selected = [c for c in state.columns if c.key in col_keys]
    else:
        selected = [c for c in state.columns if c.default]

    if not selected:
        selected = state.columns

    csv_content = exporter.to_csv(state.findings, selected)
    filename = f"appsec-{state.tool_id}-{scan_id[:8]}.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{scan_id}/export/spdx")
async def export_spdx(scan_id: str) -> StreamingResponse:
    state = store.get_scan(scan_id)
    if not state:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not state.spdx_content:
        raise HTTPException(status_code=404, detail="SPDX not available for this scan")

    filename = f"sbom-{state.tool_id}-{scan_id[:8]}.spdx.json"
    return StreamingResponse(
        iter([state.spdx_content]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
