from __future__ import annotations

import re
from typing import Annotated, Final

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from .deps import OwnedProjectDep, OwnerIdDep, RepositoryDep, SettingsDep
from .schemas import (
    DuplicateProjectRequest,
    HealthResponse,
    ProjectCreate,
    ProjectRecord,
    ProjectUpdate,
    TemplateDefinition,
    UploadResponse,
)
from .storage import save_image
from .templates import (
    TemplateNotFoundError,
    get_template,
    list_templates as query_templates,
)

router = APIRouter(prefix="/api")

PROJECT_NAME_MAX: Final[int] = 120
COPY_SUFFIX: Final[str] = " Copy"

NOT_FOUND: Final = {status.HTTP_404_NOT_FOUND: {"description": "Project not found"}}
UPLOAD_ERRORS: Final = {
    status.HTTP_400_BAD_REQUEST: {"description": "Empty or invalid upload"},
    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: {"description": "Image too large"},
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {"description": "Unsupported image type"},
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


def _ensure_known_template(template_id: str) -> None:
    """Reject writes that reference a template missing from the registry."""
    try:
        get_template(template_id)
    except TemplateNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.args[0]
        ) from None


def _slug(value: str, fallback: str = "portfolio") -> str:
    """ASCII-only filename slug, safe to place inside an HTTP header."""
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or fallback


def _copy_name(original: str) -> str:
    base = original[: PROJECT_NAME_MAX - len(COPY_SUFFIX)].rstrip()
    return f"{base}{COPY_SUFFIX}"


# --------------------------------------------------------------------------- #
# System
# --------------------------------------------------------------------------- #

@router.get("/health", response_model=HealthResponse, tags=["system"], summary="Health check")
async def health(settings: SettingsDep, repository: RepositoryDep) -> HealthResponse:
    return HealthResponse(
        status="ok",
        storage=repository.backend_name,
        environment=settings.environment,
    )


# --------------------------------------------------------------------------- #
# Templates
# --------------------------------------------------------------------------- #

@router.get("/templates", response_model=list[TemplateDefinition], tags=["templates"])
async def list_templates(
    dark_mode: Annotated[bool | None, Query(description="Only templates with dark mode")] = None,
    motion_3d: Annotated[bool | None, Query(description="Only templates with 3D motion")] = None,
    tone: Annotated[str | None, Query(max_length=40)] = None,
) -> list[TemplateDefinition]:
    return list(query_templates(dark_mode=dark_mode, motion_3d=motion_3d, tone=tone))


@router.get(
    "/templates/{template_id}",
    response_model=TemplateDefinition,
    tags=["templates"],
    responses={status.HTTP_404_NOT_FOUND: {"description": "Template not found"}},
)
async def get_template_by_id(template_id: str) -> TemplateDefinition:
    try:
        return get_template(template_id)
    except TemplateNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=exc.args[0]
        ) from None


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #

@router.post(
    "/projects",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    tags=["projects"],
    responses={status.HTTP_422_UNPROCESSABLE_ENTITY: {"description": "Invalid project"}},
)
async def create_project(
    payload: ProjectCreate,
    response: Response,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    _ensure_known_template(payload.config.template_id)
    project = await repository.create(owner_id, payload)
    response.headers["Location"] = router.url_path_for("get_project", project_id=project.id)
    return project


@router.get("/projects", response_model=list[ProjectRecord], tags=["projects"])
async def list_projects(
    response: Response,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=80)] = None,
) -> list[ProjectRecord]:
    projects = await repository.list(owner_id, limit=limit, offset=offset, search=search)
    # Lets clients build pagination UI. Expose it via CORS `expose_headers`.
    response.headers["X-Total-Count"] = str(await repository.count(owner_id, search=search))
    return projects


@router.get(
    "/projects/{project_id}",
    response_model=ProjectRecord,
    tags=["projects"],
    responses=NOT_FOUND,
)
async def get_project(project: OwnedProjectDep) -> ProjectRecord:
    return project


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectRecord,
    tags=["projects"],
    responses=NOT_FOUND,
)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    updates = {
        key: value
        for key, value in payload.model_dump(exclude_unset=True, mode="python").items()
        if value is not None
    }
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one project field must be supplied",
        )
    if payload.config is not None:
        _ensure_known_template(payload.config.template_id)

    project = await repository.update(owner_id, project_id, updates)
    if project is None:
        raise _not_found()
    return project


@router.post(
    "/projects/{project_id}/duplicate",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    tags=["projects"],
    responses=NOT_FOUND,
)
async def duplicate_project(
    project: OwnedProjectDep,
    payload: DuplicateProjectRequest,
    response: Response,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    copy_payload = ProjectCreate(
        name=payload.name or _copy_name(project.name),
        config=project.config,
    )
    created = await repository.create(owner_id, copy_payload)
    response.headers["Location"] = router.url_path_for("get_project", project_id=created.id)
    return created


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["projects"],
    responses=NOT_FOUND,
)
async def delete_project(
    project_id: str,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> Response:
    if not await repository.delete(owner_id, project_id):
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/projects/{project_id}/export",
    response_class=Response,
    tags=["projects"],
    responses={**NOT_FOUND, status.HTTP_200_OK: {"content": {"application/json": {}}}},
)
async def export_project(project: OwnedProjectDep) -> Response:
    filename = f"{_slug(project.name, fallback=f'portfolio-{project.id[:8]}')}.json"
    # owner_id is internal; the export stays portable and doesn't leak it.
    body = project.model_dump_json(indent=2, exclude={"owner_id"})
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# --------------------------------------------------------------------------- #
# Uploads
# --------------------------------------------------------------------------- #

@router.post(
    "/uploads",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["uploads"],
    responses=UPLOAD_ERRORS,
)
async def upload_image(
    owner_id: OwnerIdDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File(description="JPEG, PNG, WebP or GIF image")],
) -> UploadResponse:
    return await save_image(file, owner_id=owner_id, settings=settings)
