from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4

from .schemas import ProjectCreate, ProjectRecord


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

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None: ...

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None: ...

    async def delete(self, owner_id: str, project_id: str) -> bool: ...


def _now() -> datetime:
    return datetime.now(timezone.utc)


class InMemoryProjectRepository:
    backend_name = "memory"

    def __init__(self) -> None:
        self._items: dict[str, ProjectRecord] = {}
        self._lock = asyncio.Lock()

    async def create(self, owner_id: str, payload: ProjectCreate) -> ProjectRecord:
        async with self._lock:
            now = _now()
            record = ProjectRecord(
                id=uuid4().hex,
                owner_id=owner_id,
                created_at=now,
                updated_at=now,
                **payload.model_dump(mode="python"),
            )
            self._items[record.id] = record
            return record

    async def list(
        self,
        owner_id: str,
        *,
        limit: int,
        offset: int,
        search: str | None = None,
    ) -> list[ProjectRecord]:
        async with self._lock:
            items = [item for item in self._items.values() if item.owner_id == owner_id]
            if search:
                query = search.casefold()
                items = [
                    item
                    for item in items
                    if query in item.name.casefold()
                    or query in item.config.full_name.casefold()
                    or query in item.config.professional_title.casefold()
                ]
            items.sort(key=lambda item: item.updated_at, reverse=True)
            return items[offset : offset + limit]

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None:
        async with self._lock:
            item = self._items.get(project_id)
            if item is None or item.owner_id != owner_id:
                return None
            return item

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None:
        async with self._lock:
            current = self._items.get(project_id)
            if current is None or current.owner_id != owner_id:
                return None
            values = current.model_dump(mode="python")
            values.update(updates)
            values["updated_at"] = _now()
            updated = ProjectRecord.model_validate(values)
            self._items[project_id] = updated
            return updated

    async def delete(self, owner_id: str, project_id: str) -> bool:
        async with self._lock:
            current = self._items.get(project_id)
            if current is None or current.owner_id != owner_id:
                return False
            del self._items[project_id]
            return True


class MongoProjectRepository:
    backend_name = "mongodb"

    def __init__(self, client: Any, database_name: str) -> None:
        self._client = client
        self._collection = client[database_name]["projects"]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("owner_id", 1), ("updated_at", -1)])
        await self._collection.create_index("id", unique=True)

    async def create(self, owner_id: str, payload: ProjectCreate) -> ProjectRecord:
        now = _now()
        record = ProjectRecord(
            id=uuid4().hex,
            owner_id=owner_id,
            created_at=now,
            updated_at=now,
            **payload.model_dump(mode="python"),
        )
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
        query: dict[str, Any] = {"owner_id": owner_id}
        if search:
            escaped = re.escape(search)
            query["$or"] = [
                {"name": {"$regex": escaped, "$options": "i"}},
                {"config.full_name": {"$regex": escaped, "$options": "i"}},
                {"config.professional_title": {"$regex": escaped, "$options": "i"}},
            ]
        cursor = (
            self._collection.find(query)
            .sort("updated_at", -1)
            .skip(offset)
            .limit(limit)
        )
        return [ProjectRecord.model_validate(document) async for document in cursor]

    async def get(self, owner_id: str, project_id: str) -> ProjectRecord | None:
        document = await self._collection.find_one({"owner_id": owner_id, "id": project_id})
        return ProjectRecord.model_validate(document) if document else None

    async def update(
        self,
        owner_id: str,
        project_id: str,
        updates: dict[str, Any],
    ) -> ProjectRecord | None:
        updates = {**updates, "updated_at": _now()}
        result = await self._collection.update_one(
            {"owner_id": owner_id, "id": project_id},
            {"$set": updates},
        )
        if result.matched_count == 0:
            return None
        return await self.get(owner_id, project_id)

    async def delete(self, owner_id: str, project_id: str) -> bool:
        result = await self._collection.delete_one({"owner_id": owner_id, "id": project_id})
        return result.deleted_count == 1

    async def close(self) -> None:
        self._client.close()
