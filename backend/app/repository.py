from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any, Final, Protocol, runtime_checkable
from uuid import uuid4

from pydantic import BaseModel

from .schemas import ProjectCreate, ProjectRecord

# Only these fields may be changed through update(); identity, ownership and
# timestamps are managed by the repository itself.
UPDATABLE_FIELDS: Final[frozenset[str]] = frozenset({"name", "config"})
MAX_SEARCH_LENGTH: Final[int] = 100


@runtime_checkable
class ProjectRepository(Protocol):
    backend_name: str

    async def create(self, owner_id: str, payload: ProjectCreate) -> ProjectRecord: ...

    async def list(
        self,
        owner_id: str,
        *,
        limit: int,
        offset: int,
        search: str | None = None,
    ) -> list[ProjectRecord]: ...

    async def count(self, owner_id: str, *, search: str | None = None) -> int: ...

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None: ...

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None: ...

    async def delete(self, owner_id: str, project_id: str) -> bool: ...

    async def close(self) -> None: ...


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    """MongoDB returns naive datetimes unless tz_aware=True; normalise to UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _normalize_search(search: str | None) -> str | None:
    cleaned = (search or "").strip()[:MAX_SEARCH_LENGTH]
    return cleaned or None


def _normalize_updates(updates: Mapping[str, Any]) -> dict[str, Any]:
    """Reject protected fields and turn nested models into plain dicts."""
    forbidden = set(updates) - UPDATABLE_FIELDS
    if forbidden:
        raise ValueError(f"Fields cannot be updated: {sorted(forbidden)}")
    return {
        key: value.model_dump(mode="python") if isinstance(value, BaseModel) else value
        for key, value in updates.items()
    }


def _new_record(owner_id: str, payload: ProjectCreate) -> ProjectRecord:
    now = _now()
    return ProjectRecord(
        id=uuid4().hex,
        owner_id=owner_id,
        created_at=now,
        updated_at=now,
        **payload.model_dump(mode="python"),
    )


def _matches(record: ProjectRecord, query: str) -> bool:
    haystacks = (
        record.name,
        record.config.full_name,
        record.config.professional_title,
    )
    return any(query in text.casefold() for text in haystacks)


# --------------------------------------------------------------------------- #
# In-memory backend
# --------------------------------------------------------------------------- #

class InMemoryProjectRepository:
    backend_name = "memory"

    def __init__(self) -> None:
        # owner_id -> project_id -> record (O(1) owner-scoped access)
        self._by_owner: dict[str, dict[str, ProjectRecord]] = {}
        self._lock = asyncio.Lock()

    def _owned(self, owner_id: str, search: str | None) -> list[ProjectRecord]:
        items = list(self._by_owner.get(owner_id, {}).values())
        query = _normalize_search(search)
        if query:
            needle = query.casefold()
            items = [item for item in items if _matches(item, needle)]
        # Newest first; id breaks ties so pagination is stable.
        items.sort(key=lambda item: (item.updated_at, item.id), reverse=True)
        return items

    async def create(self, owner_id: str, payload: ProjectCreate) -> ProjectRecord:
        async with self._lock:
            record = _new_record(owner_id, payload)
            self._by_owner.setdefault(owner_id, {})[record.id] = record
            return record.model_copy(deep=True)

    async def list(
        self,
        owner_id: str,
        *,
        limit: int,
        offset: int,
        search: str | None = None,
    ) -> list[ProjectRecord]:
        limit, offset = max(limit, 0), max(offset, 0)
        async with self._lock:
            page = self._owned(owner_id, search)[offset : offset + limit]
            # Copies keep callers from mutating stored state.
            return [item.model_copy(deep=True) for item in page]

    async def count(self, owner_id: str, *, search: str | None = None) -> int:
        async with self._lock:
            return len(self._owned(owner_id, search))

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None:
        async with self._lock:
            item = self._by_owner.get(owner_id, {}).get(project_id)
            return item.model_copy(deep=True) if item else None

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None:
        changes = _normalize_updates(updates)
        async with self._lock:
            current = self._by_owner.get(owner_id, {}).get(project_id)
            if current is None:
                return None
            values = current.model_dump(mode="python")
            values.update(changes)
            values["updated_at"] = _now()
            updated = ProjectRecord.model_validate(values)
            self._by_owner[owner_id][project_id] = updated
            return updated.model_copy(deep=True)

    async def delete(self, owner_id: str, project_id: str) -> bool:
        async with self._lock:
            owned = self._by_owner.get(owner_id)
            if not owned or project_id not in owned:
                return False
            del owned[project_id]
            if not owned:
                del self._by_owner[owner_id]
            return True

    async def close(self) -> None:
        return None


# --------------------------------------------------------------------------- #
# MongoDB backend (Motor / async PyMongo)
# --------------------------------------------------------------------------- #

class MongoProjectRepository:
    backend_name = "mongodb"

    _NO_OBJECT_ID: Final = {"_id": 0}

    def __init__(self, client: Any, database_name: str) -> None:
        from pymongo import ReturnDocument  # imported lazily: memory mode needs no Mongo

        self._return_after = ReturnDocument.AFTER
        self._client = client
        self._collection = client[database_name]["projects"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("id", unique=True, name="uniq_project_id")
        await self._collection.create_index(
            [("owner_id", 1), ("updated_at", -1), ("id", 1)],
            name="owner_recent",
        )

    @classmethod
    def _to_record(cls, document: Mapping[str, Any]) -> ProjectRecord:
        data = dict(document)
        for key in ("created_at", "updated_at"):
            if isinstance(data.get(key), datetime):
                data[key] = _as_utc(data[key])
        return ProjectRecord.model_validate(data)

    @staticmethod
    def _build_query(owner_id: str, search: str | None) -> dict[str, Any]:
        query: dict[str, Any] = {"owner_id": owner_id}
        term = _normalize_search(search)
        if term:
            pattern = {"$regex": re.escape(term), "$options": "i"}
            query["$or"] = [
                {"name": pattern},
                {"config.full_name": pattern},
                {"config.professional_title": pattern},
            ]
        return query

    async def create(self, owner_id: str, payload: ProjectCreate) -> ProjectRecord:
        record = _new_record(owner_id, payload)
        await self._collection.insert_one(record.model_dump(mode="python"))
        return record

    async def list(
        self,
        owner_id: str,
        *,
        limit: int,
        offset: int,
        search: str | None = None,
    ) -> list[ProjectRecord]:
        limit, offset = max(limit, 0), max(offset, 0)
        if limit == 0:
            return []
        cursor = (
            self._collection.find(self._build_query(owner_id, search), self._NO_OBJECT_ID)
            .sort([("updated_at", -1), ("id", 1)])
            .skip(offset)
            .limit(limit)
        )
        return [self._to_record(document) async for document in cursor]

    async def count(self, owner_id: str, *, search: str | None = None) -> int:
        return await self._collection.count_documents(self._build_query(owner_id, search))

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None:
        document = await self._collection.find_one(
            {"owner_id": owner_id, "id": project_id}, self._NO_OBJECT_ID
        )
        return self._to_record(document) if document else None

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None:
        changes = {**_normalize_updates(updates), "updated_at": _now()}
        # Single atomic round trip: update and return the new document.
        document = await self._collection.find_one_and_update(
            {"owner_id": owner_id, "id": project_id},
            {"$set": changes},
            projection=self._NO_OBJECT_ID,
            return_document=self._return_after,
        )
        return self._to_record(document) if document else None

    async def delete(self, owner_id: str, project_id: str) -> bool:
        result = await self._collection.delete_one({"owner_id": owner_id, "id": project_id})
        return result.deleted_count == 1

    async def close(self) -> None:
        self._client.close()
