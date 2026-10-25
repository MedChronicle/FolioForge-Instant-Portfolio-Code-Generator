from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from .config import Settings
from .schemas import UploadResponse


ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

SIGNATURES = {
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    "image/gif": lambda data: data.startswith((b"GIF87a", b"GIF89a")),
}


def _safe_segment(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", value).strip("._")
    return safe[:64] or "local-user"


async def save_image(
    file: UploadFile,
    *,
    owner_id: str,
    settings: Settings,
) -> UploadResponse:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, WebP, and GIF images are supported",
        )

    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image must be {settings.max_upload_bytes // (1024 * 1024)} MB or smaller",
        )
    if not SIGNATURES[content_type](content):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The uploaded file does not match its declared image type",
        )

    owner_dir = settings.upload_dir / _safe_segment(owner_id)
    owner_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{ALLOWED_TYPES[content_type]}"
    destination = owner_dir / filename
    destination.write_bytes(content)

    return UploadResponse(
        url=f"/uploads/{_safe_segment(owner_id)}/{filename}",
        filename=filename,
        content_type=content_type,
        size=len(content),
    )
