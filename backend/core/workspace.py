from __future__ import annotations
import shutil
import zipfile
from pathlib import Path


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

    def extract_zip(self, data: bytes) -> None:
        zip_path = self.base / "upload.zip"
        zip_path.write_bytes(data)
        with zipfile.ZipFile(zip_path) as zf:
            # Guard against zip slip
            for member in zf.namelist():
                dest = (self.src / member).resolve()
                if not str(dest).startswith(str(self.src.resolve())):
                    raise ValueError(f"Zip slip detected: {member}")
            zf.extractall(self.src)
        zip_path.unlink()

    def save_image_tar(self, data: bytes) -> Path:
        tar_path = self.input / "image.tar.gz"
        tar_path.write_bytes(data)
        return tar_path

    def clear_out(self) -> None:
        if self.out.exists():
            shutil.rmtree(self.out)
        self.out.mkdir()

    def cleanup(self) -> None:
        if self.base.exists():
            shutil.rmtree(self.base, ignore_errors=True)
