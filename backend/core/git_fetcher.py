from __future__ import annotations
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def clone_repo(url: str, dest: Path) -> None:
    """Shallow-clone a git repository into dest."""
    logger.info("Cloning %s → %s", url, dest)
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--", url, str(dest)],
            capture_output=True,
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        logger.error("git clone timed out after 180s for %s", url)
        raise RuntimeError(
            f"git clone timed out after 3 minutes for '{url}'. "
            "Check that the URL is accessible from the container and try again."
        )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        logger.error(
            "git clone failed (exit %d) for %s:\n%s", result.returncode, url, stderr
        )
        raise RuntimeError(
            f"git clone failed for '{url}' (exit {result.returncode}):\n{stderr}"
        )

    logger.info("Clone complete: %s → %s", url, dest)
