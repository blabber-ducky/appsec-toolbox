from __future__ import annotations
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from routers import tools, scans, results, multiscan

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

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
app.include_router(multiscan.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


_static = Path(__file__).parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="static")
    logger.info("Serving frontend from %s", _static)
else:
    logger.info("No static dir found — running in API-only / dev mode")
