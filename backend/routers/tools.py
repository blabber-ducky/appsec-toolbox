from __future__ import annotations
from pathlib import Path

import yaml
from fastapi import APIRouter

router = APIRouter(prefix="/api/tools", tags=["tools"])

_TOOLS_YAML = Path(__file__).parent.parent / "config" / "tools.yaml"


@router.get("")
async def get_tools() -> dict:
    with open(_TOOLS_YAML) as f:
        return yaml.safe_load(f)
