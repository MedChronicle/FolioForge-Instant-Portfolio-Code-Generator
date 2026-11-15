from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Final
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from .config import Settings
from .schemas import UploadResponse

logger = logging.getLogger(__name__)

CHUNK_SIZE: Final[int] = 64 * 1024
DEFAULT_OWNER: Final[str] = "local-user"

ALLOWED_TYPES: Final[dict[str, str]] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

# Content types some clients send for the same formats.
TYPE_ALIASES: Final[dict[str, str]] = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
}


def _is_jpeg(data: bytes) -> bool:
    return data.startswith(b"\xff\xd8\xff")


def _is_png(data: bytes) -> bool:
    return data.startswith(b"\x89PNG\r\n\x1a\n")


def _is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"


def _is_gif(data: bytes) -> bool:
    return data.startswith((b"GIF87a", b"GIF89a"))


SIGNATURES: Final = {
    "image/jpeg": _is_jpeg,
    "image/png": _is_png,
    "image/webp": _is_webp,
    "image/gif": _is_gif,
}


def sniff_content_type(data: bytes) -> str | None:
    """Detect the real image type from magic bytes, ignoring client claims."""
    for mime, check in SIGNATURES.items():
        if check(data):
            return mime
    return None


def _safe_segment(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", value).strip("._")
    return safe[:64] or DEFAULT_OWNER


def _normalize_type(raw: str | None) -> str:
    base = (raw or "").split(";", 1)[0].strip().lower()
    return TYPE_ALIASES.get(base, base)


def _http_error(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    """Stream the upload in chunks and abort as soon as the limit is exceeded."""
    buffer = bytearray()
    while chunk := await file.read(CHUNK_SIZE):
        buffer.extend(chunk)
        if len(buffer) > limit:
            raise _http_error(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Image must be {limit // (1024 * 1024)} MB or smaller",
            )
    return bytes(buffer)


def _write_atomic(destination: Path, content: bytes) -> None:
    """Write to a temp file, fsync, then rename so readers never see partial files."""
    tmp = destination.with_name(f".{destination.name}.part")
    try:
        with open(tmp, "wb") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, destination)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


async def save_image(
    file: UploadFile,
    *,
    owner_id: str,
    settings: Settings,
) -> UploadResponse:
    declared = _normalize_type(file.content_type)
    if declared not in ALLOWED_TYPES:
        raise _http_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only JPEG, PNG, WebP, and GIF images are supported",
        )

    try:
        content = await _read_limited(file, settings.max_upload_bytes)
    finally:
        await file.close()

    if not content:
        raise _http_error(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")

    # Trust the bytes, not the header: detect the real type and require a match.
    detected = sniff_content_type(content)
    if detected != declared:
        raise _http_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "The uploaded file does not match its declared image type",
        )

    owner_segment = _safe_segment(owner_id)
    upload_root = Path(settings.upload_dir).resolve()
    owner_dir = (upload_root / owner_segment).resolve()
    if not owner_dir.is_relative_to(upload_root):  # defense in depth
        raise _http_error(status.HTTP_400_BAD_REQUEST, "Invalid upload location")

    filename = f"{uuid4().hex}{ALLOWED_TYPES[detected]}"
    destination = owner_dir / filename

    try:
        # Blocking disk I/O runs in a worker thread so the event loop stays free.
        await asyncio.to_thread(owner_dir.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(_write_atomic, destination, content)
    except OSError:
        logger.exception("Failed to store upload for owner %s", owner_segment)
        raise _http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not store the uploaded image"
        ) from None

    return UploadResponse(
        url=f"/uploads/{owner_segment}/{filename}",
        filename=filename,
        content_type=detected,
        size=len(content),
    )
