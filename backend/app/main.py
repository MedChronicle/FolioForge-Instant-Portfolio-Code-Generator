from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Awaitable, Callable

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .api import router
from .config import Settings, get_settings
from .repository import InMemoryProjectRepository, MongoProjectRepository

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
MONGO_TIMEOUT_MS = 2_000


async def _build_repository(
    settings: Settings,
) -> tuple[InMemoryProjectRepository | MongoProjectRepository, Any | None]:
    """Create the repository for the configured backend.

    Returns the repository and the Mongo client (``None`` for in-memory) so the
    caller can close it on shutdown.
    """
    if not settings.mongodb_url:
        logger.info("MONGODB_URL not set; using in-memory repository")
        return InMemoryProjectRepository(), None

    try:
        from motor.motor_asyncio import AsyncIOMotorClient
    except ImportError as error:  # pragma: no cover - only with MongoDB configured
        raise RuntimeError(
            "MONGODB_URL is set, but the optional 'motor' dependency is not installed"
        ) from error

    client = AsyncIOMotorClient(
        settings.mongodb_url,
        serverSelectionTimeoutMS=MONGO_TIMEOUT_MS,
    )
    try:
        await client.admin.command("ping")
        repository = MongoProjectRepository(client, settings.mongodb_database)
        await repository.ensure_indexes()
    except Exception:
        client.close()  # don't leak the connection pool on startup failure
        raise
    logger.info("Connected to MongoDB database %r", settings.mongodb_database)
    return repository, client


def _register_middleware(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(GZipMiddleware, minimum_size=1_024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER, "X-Process-Time"],
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled error [%s] %s %s", request_id, request.method, request.url.path
            )
            response = JSONResponse(
                {"detail": "Internal server error", "request_id": request_id},
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        elapsed_ms = (time.perf_counter() - started) * 1_000
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}ms"
        logger.info(
            "%s %s -> %s (%.1fms) [%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        return response


def _register_exception_handlers(app: FastAPI) -> None:
    def _payload(request: Request, detail: Any) -> dict[str, Any]:
        return {"detail": detail, "request_id": getattr(request.state, "request_id", None)}

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            _payload(request, exc.detail),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            _payload(request, exc.errors()),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()
    runtime_settings.upload_dir.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        repository, mongo_client = await _build_repository(runtime_settings)
        app.state.settings = runtime_settings
        app.state.repository = repository
        app.state.started_at = time.time()
        try:
            yield
        finally:
            if mongo_client is not None:
                mongo_client.close()
            logger.info("FolioForge backend shut down cleanly")

    app = FastAPI(
        title=runtime_settings.app_name,
        version=__version__,
        description="Persistence and asset API for the FolioForge portfolio builder.",
        lifespan=lifespan,
    )

    _register_middleware(app, runtime_settings)
    _register_exception_handlers(app)

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
            "version": __version__,
            "docs": "/docs",
            "health": "/api/health",
            "ready": "/readyz",
        }

    @app.get("/readyz", include_in_schema=False)
    async def ready(request: Request) -> JSONResponse:
        """Readiness probe: 200 only once the repository is initialised."""
        repository = getattr(request.app.state, "repository", None)
        ok = repository is not None
        return JSONResponse(
            {
                "status": "ready" if ok else "starting",
                "uptime_s": round(time.time() - getattr(request.app.state, "started_at", time.time()), 1),
            },
            status_code=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return app


# Kept for `uvicorn app.main:app`. Prefer the factory form in new deployments:
#   uvicorn app.main:create_app --factory
app = create_app()
