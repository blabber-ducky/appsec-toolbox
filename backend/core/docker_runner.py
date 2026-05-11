from __future__ import annotations
import gzip
import logging
from typing import Callable

import docker
from docker.errors import APIError, ImageNotFound

logger = logging.getLogger(__name__)

_client: docker.DockerClient | None = None


def _get_client() -> docker.DockerClient:
    global _client
    if _client is None:
        logger.info("Connecting to Docker daemon via unix:///var/run/docker.sock")
        try:
            _client = docker.DockerClient(base_url="unix:///var/run/docker.sock")
            version = _client.version()
            logger.info(
                "Docker daemon connected — engine %s, API %s",
                version.get("Version", "?"),
                version.get("ApiVersion", "?"),
            )
        except Exception as exc:
            logger.exception("Failed to connect to Docker daemon: %s", exc)
            raise
    return _client


def pull_image(image: str, log: Callable[[str], None]) -> None:
    """Pull a Docker image, streaming layer progress to the log callback."""
    client = _get_client()
    logger.info("Pulling image: %s", image)
    log(f"[docker] Pulling {image} ...")
    try:
        for line in client.api.pull(image, stream=True, decode=True):
            status = line.get("status", "")
            error = line.get("error")
            if error:
                logger.error("Image pull error for %s: %s", image, error)
                raise RuntimeError(f"Image pull error: {error}")
            if status in ("Pull complete", "Already exists", "Download complete"):
                logger.debug("[pull] %s — %s", image, status)
                log(f"[docker] {status}")
            elif status and "Pulling" in status:
                log(f"[docker] {status}")
    except APIError as exc:
        logger.exception("APIError pulling image %s: %s", image, exc)
        raise RuntimeError(f"Failed to pull {image}: {exc}") from exc
    logger.info("Image ready: %s", image)
    log(f"[docker] {image} ready.")


def run_container(
    image: str,
    command: str,
    volumes: dict[str, dict],
    log: Callable[[str], None],
    network_mode: str = "none",
    environment: dict | None = None,
) -> int:
    """Run a container synchronously, stream stdout/stderr, return exit code."""
    client = _get_client()
    logger.info(
        "Starting container — image=%s network=%s command=%r",
        image, network_mode, command,
    )
    logger.debug("Volumes: %s", volumes)
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
        logger.info("Container started — id=%s image=%s", container.short_id, image)
        log(f"[docker] Container {container.short_id} started.")

        for chunk in container.logs(stream=True, follow=True):
            line = chunk.decode("utf-8", errors="replace").strip()
            if line:
                logger.debug("[container:%s] %s", container.short_id, line)
                log(line)

        result = container.wait()
        code = result.get("StatusCode", 1)
        if code == 0:
            logger.info("Container %s exited cleanly (code 0)", container.short_id)
        elif code == 1:
            logger.info(
                "Container %s exited with code 1 — likely findings present", container.short_id
            )
        else:
            logger.warning(
                "Container %s exited with unexpected code %d", container.short_id, code
            )
        log(f"[docker] Container exited (code {code}).")
        return code

    except APIError as exc:
        logger.exception(
            "APIError running container image=%s command=%r: %s", image, command, exc
        )
        raise RuntimeError(
            f"Docker container error (image={image}): {exc.explanation or exc}"
        ) from exc
    finally:
        if container:
            try:
                container.remove(force=True)
                logger.debug("Container %s removed.", container.short_id)
            except Exception as exc:
                logger.warning("Could not remove container: %s", exc)


def pull_and_save_image(
    image_ref: str, out_path: str, log: Callable[[str], None]
) -> None:
    """Pull a registry image and save it as a gzipped tar to out_path."""
    client = _get_client()
    logger.info("Pulling image for save: %s → %s", image_ref, out_path)
    log(f"[docker] Pulling image {image_ref} ...")
    try:
        img = client.images.pull(image_ref)
    except ImageNotFound:
        logger.error("Image not found in registry: %s", image_ref)
        raise RuntimeError(
            f"Image '{image_ref}' not found. "
            "Check the name and tag, and ensure the registry is reachable."
        )
    except APIError as exc:
        logger.exception("APIError pulling %s: %s", image_ref, exc)
        raise RuntimeError(f"Failed to pull {image_ref}: {exc}") from exc

    logger.info("Saving %s to %s", image_ref, out_path)
    log("[docker] Saving image to tar.gz (this may take a moment) ...")
    try:
        with gzip.open(out_path, "wb") as f:
            for chunk in img.save(named=True):
                f.write(chunk)
    except OSError as exc:
        logger.exception("Failed to write image tar to %s: %s", out_path, exc)
        raise RuntimeError(f"Could not write image tar: {exc}") from exc

    logger.info("Image saved: %s → %s", image_ref, out_path)
    log("[docker] Image saved.")
