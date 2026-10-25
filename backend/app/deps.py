from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from .config import Settings
from .repository import ProjectRepository
from .schemas import OWNER_ID


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_repository(request: Request) -> ProjectRepository:
    return request.app.state.repository


async def get_owner_id(
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> str:
    owner_id = (x_user_id or "local-user").strip()
    if not OWNER_ID.fullmatch(owner_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-User-Id contains unsupported characters",
        )
    return owner_id


RepositoryDep = Annotated[ProjectRepository, Depends(get_repository)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
OwnerIdDep = Annotated[str, Depends(get_owner_id)]
