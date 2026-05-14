from __future__ import annotations
import logging
import shutil
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)


class SubWorkspace:
    """Per-scan workspace view inside a multi-scan job.

    Shares src/input from the parent MultiScanWorkspace; has its own
    isolated out/ directory so concurrent scans don't collide on output.
    """

    def __init__(self, src: Path, out: Path, input_dir: Path) -> None:
        self.src = src
        self.out = out
        self.input = input_dir

    def clear_out(self) -> None:
        if self.out.exists():
            shutil.rmtree(self.out)
        self.out.mkdir(parents=True)

    def cleanup(self) -> None:
        pass  # parent MultiScanWorkspace owns cleanup


class MultiScanWorkspace:
    """Shared workspace for a multi-scan job.

    Layout:
      /tmp/appsec-ms-<id>/
        src/            ← extracted source (shared, read-only by containers)
        input/          ← image tar (shared, read-only by containers)
        scans/<scan_id>/out/  ← per-scan output dirs
    """

    def __init__(self, multiscan_id: str) -> None:
        self.multiscan_id = multiscan_id
        self.base = Path(f"/tmp/appsec-ms-{multiscan_id}")
        self.src = self.base / "src"
        self.input = self.base / "input"
        self._scans_dir = self.base / "scans"

    def create(self) -> None:
        self.src.mkdir(parents=True, exist_ok=True)
        self.input.mkdir(parents=True, exist_ok=True)
        self._scans_dir.mkdir(parents=True, exist_ok=True)
        logger.info("MultiScanWorkspace created: %s", self.base)

    def scan_workspace(self, scan_id: str) -> SubWorkspace:
        out = self._scans_dir / scan_id / "out"
        out.mkdir(parents=True, exist_ok=True)
        return SubWorkspace(src=self.src, out=out, input_dir=self.input)

    def extract_zip(self, data: bytes) -> None:
        zip_path = self.base / "upload.zip"
        zip_path.write_bytes(data)
        logger.info("Extracting ZIP (%d bytes) to %s", len(data), self.src)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                for member in zf.namelist():
                    dest = (self.src / member).resolve()
                    if not str(dest).startswith(str(self.src.resolve())):
                        raise ValueError(f"Unsafe ZIP entry '{member}'")
                zf.extractall(self.src)
        except zipfile.BadZipFile as exc:
            raise RuntimeError("The uploaded file is not a valid ZIP archive.") from exc
        zip_path.unlink()

    def save_image_tar(self, data: bytes) -> Path:
        tar_path = self.input / "image.tar.gz"
        tar_path.write_bytes(data)
        logger.info("Image tar saved to %s (%d bytes)", tar_path, len(data))
        return tar_path

    def cleanup(self) -> None:
        if self.base.exists():
            shutil.rmtree(self.base, ignore_errors=True)
            logger.info("MultiScanWorkspace cleaned up: %s", self.base)


class Workspace:
    """Manages a temporary per-scan directory under /tmp.

    /tmp is bind-mounted from the host, so these paths are also valid
    on the host side — required for Docker volume mounts on tool containers
    that the host daemon launches.
    """

    def __init__(self, scan_id: str):
        self.scan_id = scan_id
        self.base = Path(f"/tmp/appsec-{scan_id}")
        self.src = self.base / "src"
        self.out = self.base / "out"
        self.input = self.base / "input"

    def create(self) -> None:
        self.src.mkdir(parents=True, exist_ok=True)
        self.out.mkdir(parents=True, exist_ok=True)
        self.input.mkdir(parents=True, exist_ok=True)
        logger.info("Workspace created: %s", self.base)

    def extract_zip(self, data: bytes) -> None:
        zip_path = self.base / "upload.zip"
        zip_path.write_bytes(data)
        logger.info("Extracting ZIP (%d bytes) to %s", len(data), self.src)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                members = zf.namelist()
                logger.debug("ZIP contains %d entries", len(members))
                for member in members:
                    dest = (self.src / member).resolve()
                    if not str(dest).startswith(str(self.src.resolve())):
                        logger.error("Zip slip detected for entry: %s", member)
                        raise ValueError(
                            f"Unsafe ZIP entry '{member}' would extract outside the target directory. "
                            "Ensure your ZIP does not contain absolute paths or '..' components."
                        )
                zf.extractall(self.src)
        except zipfile.BadZipFile as exc:
            logger.exception("Invalid ZIP file: %s", exc)
            raise RuntimeError(
                "The uploaded file is not a valid ZIP archive. "
                "Please compress your source directory with 'zip -r archive.zip .' and try again."
            ) from exc
        zip_path.unlink()
        logger.info("ZIP extracted — %d entries to %s", len(zf.namelist()), self.src)

    def save_image_tar(self, data: bytes) -> Path:
        tar_path = self.input / "image.tar.gz"
        tar_path.write_bytes(data)
        logger.info("Image tar saved: %s (%d bytes)", tar_path, len(data))
        return tar_path

    def clear_out(self) -> None:
        if self.out.exists():
            shutil.rmtree(self.out)
        self.out.mkdir()
        logger.debug("Output dir cleared: %s", self.out)

    def cleanup(self) -> None:
        if self.base.exists():
            shutil.rmtree(self.base, ignore_errors=True)
            logger.info("Workspace cleaned up: %s", self.base)
