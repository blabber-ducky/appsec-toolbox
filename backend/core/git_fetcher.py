from __future__ import annotations
import subprocess
from pathlib import Path


def clone_repo(url: str, dest: Path) -> None:
    """Shallow-clone a git repository into dest."""
    result = subprocess.run(
        ["git", "clone", "--depth", "1", "--", url, str(dest)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git clone failed (exit {result.returncode}): {result.stderr.strip()}"
        )
