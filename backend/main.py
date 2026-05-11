from __future__ import annotations
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import tools, scans, results

app = FastAPI(title="AppSec Toolbox", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tools.router)
app.include_router(scans.router)
app.include_router(results.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# Serve the React SPA in production (frontend/dist copied to ./static by Dockerfile)
_static = Path(__file__).parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="static")
