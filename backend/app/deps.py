from dataclasses import dataclass
from typing import Annotated, Final, TypeVar

from fastapi import Depends, Header, HTTPException, Path, Query, Request, status

from .config import Settings
from .repository import ProjectRepository
from .schemas import OWNER_ID, ProjectRecord

DEFAULT_OWNER_ID: Final[str] = "local-user"
MAX_PAGE_SIZE: Final[int] = 100

T = TypeVar("T")


def _app_state(request: Request, name: str, expected: str) -> object:
    """Fetch an object from app.state, failing clearly if startup hasn't run."""
    try:
        return getattr(request.app.state, name)
    except AttributeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{expected} is not initialized yet",
        ) from None


def get_settings(request: Request) -> Settings:
    return _app_state(request, "settings", "Settings")  # type: ignore[return-value]


def get_repository(request: Request) -> ProjectRepository:
    return _app_state(request, "repository", "Repository")  # type: ignore[return-value]


async def get_owner_id(
    x_user_id: Annotated[
        str | None,
        Header(
            alias="X-User-Id",
            max_length=256,  # cheap guard before the regex runs
            description="Identifier of the caller; defaults to a local user.",
        ),
    ] = None,
) -> str:
    owner_id = (x_user_id or DEFAULT_OWNER_ID).strip() or DEFAULT_OWNER_ID
    if not OWNER_ID.fullmatch(owner_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-User-Id contains unsupported characters",
        )
    return owner_id


RepositoryDep = Annotated[ProjectRepository, Depends(get_repository)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
OwnerIdDep = Annotated[str, Depends(get_owner_id)]


# --------------------------------------------------------------------------- #
# Optional helpers that remove boilerplate from routes
# --------------------------------------------------------------------------- #

async def get_owned_project(
    project_id: Annotated[str, Path(min_length=1, max_length=80)],
    owner_id: OwnerIdDep,
    repository: RepositoryDep,
) -> ProjectRecord:
    """Resolve {project_id} for the caller, or raise 404.

    Projects owned by someone else also return 404, so ids can't be probed.
    """
    project = await repository.get(owner_id, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return project


@dataclass(frozen=True, slots=True)
class Pagination:
    limit: int
    offset: int
    search: str | None


def get_pagination(
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> Pagination:
    return Pagination(limit=limit, offset=offset, search=(search or "").strip() or None)


OwnedProjectDep = Annotated[ProjectRecord, Depends(get_owned_project)]
PaginationDep = Annotated[Pagination, Depends(get_pagination)]
