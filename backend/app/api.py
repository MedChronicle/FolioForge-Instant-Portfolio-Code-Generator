from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response

from .deps import OwnerIdDep, RepositoryDep, SettingsDep
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
from .templates import TEMPLATES


router = APIRouter(prefix="/api")


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def health(request: Request) -> HealthResponse:
    settings = request.app.state.settings
    repository = request.app.state.repository
    return HealthResponse(
        status="ok",
        storage=repository.backend_name,
        environment=settings.environment,
    )


@router.get("/templates", response_model=list[TemplateDefinition], tags=["templates"])
async def list_templates() -> list[TemplateDefinition]:
    return TEMPLATES


@router.post(
    "/projects",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    tags=["projects"],
)
async def create_project(
    payload: ProjectCreate,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    return await repository.create(owner_id, payload)


@router.get("/projects", response_model=list[ProjectRecord], tags=["projects"])
async def list_projects(
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=80)] = None,
) -> list[ProjectRecord]:
    return await repository.list(owner_id, limit=limit, offset=offset, search=search)


@router.get("/projects/{project_id}", response_model=ProjectRecord, tags=["projects"])
async def get_project(
    project_id: str,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    project = await repository.get(owner_id, project_id)
    if project is None:
        raise _not_found()
    return project


@router.patch("/projects/{project_id}", response_model=ProjectRecord, tags=["projects"])
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

    project = await repository.update(owner_id, project_id, updates)
    if project is None:
        raise _not_found()
    return project


@router.post(
    "/projects/{project_id}/duplicate",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    tags=["projects"],
)
async def duplicate_project(
    project_id: str,
    payload: DuplicateProjectRequest,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    project = await repository.get(owner_id, project_id)
    if project is None:
        raise _not_found()

    copy_payload = ProjectCreate(
        name=payload.name or f"{project.name} Copy",
        config=project.config,
    )
    return await repository.create(owner_id, copy_payload)


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["projects"],
)
async def delete_project(
    project_id: str,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> Response:
    deleted = await repository.delete(owner_id, project_id)
    if not deleted:
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/export", tags=["projects"])
async def export_project(
    project_id: str,
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> Response:
    project = await repository.get(owner_id, project_id)
    if project is None:
        raise _not_found()

    filename = f"{project.name.lower().replace(' ', '-')}.json"
    body = json.dumps(project.model_dump(mode="json"), ensure_ascii=False, indent=2)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/uploads",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["uploads"],
)
async def upload_image(
    owner_id: OwnerIdDep,
    settings: SettingsDep,
    file: UploadFile = File(...),
) -> UploadResponse:
    return await save_image(file, owner_id=owner_id, settings=settings)
