from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import Settings, get_settings
from .repository import InMemoryProjectRepository, MongoProjectRepository


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()
    runtime_settings.upload_dir.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        mongo_client = None
        if runtime_settings.mongodb_url:
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
            except ImportError as error:  # pragma: no cover - only used with MongoDB configured
                raise RuntimeError(
                    "MONGODB_URL is set, but the optional 'motor' dependency is not installed"
                ) from error

            mongo_client = AsyncIOMotorClient(
                runtime_settings.mongodb_url,
                serverSelectionTimeoutMS=2_000,
            )
            await mongo_client.admin.command("ping")
            repository = MongoProjectRepository(
                mongo_client,
                runtime_settings.mongodb_database,
            )
            await repository.ensure_indexes()
        else:
            repository = InMemoryProjectRepository()

        app.state.settings = runtime_settings
        app.state.repository = repository
        try:
            yield
        finally:
            if mongo_client is not None:
                mongo_client.close()

    app = FastAPI(
        title=runtime_settings.app_name,
        version="1.0.0",
        description="Persistence and asset API for the FolioForge portfolio builder.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.mount(
        "/uploads",
        StaticFiles(directory=str(runtime_settings.upload_dir)),
        name="uploads",
    )
    app.include_router(router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "name": runtime_settings.app_name,
            "docs": "/docs",
            "health": "/api/health",
        }

    return app


app = create_app()
