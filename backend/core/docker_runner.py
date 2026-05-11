from __future__ import annotations
import gzip
import logging
from typing import Callable

import docker
from docker.errors import APIError

logger = logging.getLogger(__name__)

_client: docker.DockerClient | None = None


def _get_client() -> docker.DockerClient:
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def pull_image(image: str, log: Callable[[str], None]) -> None:
    """Pull a Docker image, streaming progress to log callback."""
    client = _get_client()
    log(f"[docker] Pulling {image} ...")
    try:
        for line in client.api.pull(image, stream=True, decode=True):
            status = line.get("status", "")
            progress = line.get("progress", "")
            if status and "Pull complete" in status or "Already exists" in status:
                log(f"[docker] {status}")
            elif status and progress:
                pass  # suppress noisy progress bars
            elif status:
                log(f"[docker] {status}")
    except APIError as exc:
        raise RuntimeError(f"Failed to pull {image}: {exc}") from exc
    log(f"[docker] {image} ready.")


def run_container(
    image: str,
    command: str,
    volumes: dict[str, dict],
    log: Callable[[str], None],
    network_mode: str = "none",
    environment: dict | None = None,
) -> int:
    """Run a container synchronously, stream logs, return exit code."""
    client = _get_client()
    container = None
    try:
        container = client.containers.run(
            image=image,
            command=command,
            volumes=volumes,
            network_mode=network_mode,
            environment=environment or {},
            detach=True,
            stdout=True,
            stderr=True,
        )
        log(f"[docker] Container {container.short_id} started.")
        for chunk in container.logs(stream=True, follow=True):
            line = chunk.decode("utf-8", errors="replace").strip()
            if line:
                log(line)
        result = container.wait()
        code = result.get("StatusCode", 1)
        log(f"[docker] Container exited (code {code}).")
        return code
    except APIError as exc:
        raise RuntimeError(f"Container error: {exc}") from exc
    finally:
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


def pull_and_save_image(
    image_ref: str, out_path: str, log: Callable[[str], None]
) -> None:
    """Pull a registry image and save it as a gzipped tar to out_path.

    Used for image-ref build scans so tool containers stay air-gapped.
    """
    client = _get_client()
    log(f"[docker] Pulling image {image_ref} ...")
    try:
        img = client.images.pull(image_ref)
    except APIError as exc:
        raise RuntimeError(f"Failed to pull {image_ref}: {exc}") from exc
    log("[docker] Saving image to tar.gz ...")
    with gzip.open(out_path, "wb") as f:
        for chunk in img.save(named=True):
            f.write(chunk)
    log("[docker] Image saved.")
