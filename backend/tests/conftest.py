from __future__ import annotations

import base64
import copy
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

ClientFactory = Callable[..., TestClient]
ConfigFactory = Callable[..., dict[str, Any]]
ProjectFactory = Callable[..., dict[str, Any]]


# --------------------------------------------------------------------------- #
# Settings, app and client
# --------------------------------------------------------------------------- #
@pytest.fixture()
def settings_factory(tmp_path: Path) -> Callable[..., Settings]:
    """Build Settings with test defaults; any field can be overridden per test."""

    def _make(**overrides: Any) -> Settings:
        defaults: dict[str, Any] = {
            "environment": "test",
            "upload_dir": tmp_path,
            "cors_origins": ["http://testserver"],
        }
        return Settings(**{**defaults, **overrides})

    return _make


@pytest.fixture()
def settings(settings_factory: Callable[..., Settings]) -> Settings:
    return settings_factory()


@pytest.fixture()
def app(settings: Settings) -> Iterator[FastAPI]:
    application = create_app(settings)
    yield application
    # Never let dependency overrides leak between tests.
    application.dependency_overrides.clear()


@pytest.fixture()
def client(app: FastAPI) -> Iterator[TestClient]:
    """Default client. Runs lifespan startup/shutdown via the context manager."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def client_factory(
    settings_factory: Callable[..., Settings],
) -> Iterator[ClientFactory]:
    """Create clients with custom Settings (e.g. small upload limits, other CORS).

    Usage:
        def test_x(client_factory):
            c = client_factory(cors_origins=["https://example.com"])
    """
    stack: list[TestClient] = []

    def _make(*, raise_server_exceptions: bool = True, **overrides: Any) -> TestClient:
        application = create_app(settings_factory(**overrides))
        test_client = TestClient(
            application, raise_server_exceptions=raise_server_exceptions
        )
        test_client.__enter__()
        stack.append(test_client)
        return test_client

    yield _make

    for test_client in reversed(stack):
        test_client.__exit__(None, None, None)


# --------------------------------------------------------------------------- #
# Identity
# --------------------------------------------------------------------------- #
@pytest.fixture()
def owner_headers() -> dict[str, str]:
    return {"X-User-Id": "ada"}


@pytest.fixture()
def intruder_headers() -> dict[str, str]:
    return {"X-User-Id": "someone-else"}


# --------------------------------------------------------------------------- #
# Data factories
# --------------------------------------------------------------------------- #
@pytest.fixture()
def make_config() -> ConfigFactory:
    """Valid portfolio config; top-level keys can be overridden."""

    def _make(**overrides: Any) -> dict[str, Any]:
        config: dict[str, Any] = {
            "template_id": "creative-editorial",
            "full_name": "Ada Lovelace",
            "professional_title": "Computing pioneer",
            "short_intro": "Building thoughtful tools.",
            "bio": "A short biography.",
            "email": "ada@example.com",
            "social_links": [{"platform": "GitHub", "url": "https://github.com/ada"}],
            "skills": ["Python", "Systems design"],
            "projects": [
                {
                    "title": "Analytical Engine",
                    "description": "A project description.",
                    "tags": ["Research"],
                    "repo_url": "https://github.com/ada/engine",
                }
            ],
        }
        return copy.deepcopy({**config, **overrides})

    return _make


@pytest.fixture()
def make_project(
    client: TestClient,
    owner_headers: dict[str, str],
    make_config: ConfigFactory,
) -> ProjectFactory:
    """Create a project through the API, assert success, return its JSON."""

    def _make(
        name: str = "Ada portfolio",
        headers: dict[str, str] | None = None,
        **config_overrides: Any,
    ) -> dict[str, Any]:
        response = client.post(
            "/api/projects",
            headers=headers or owner_headers,
            json={"name": name, "config": make_config(**config_overrides)},
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _make


@pytest.fixture()
def project(make_project: ProjectFactory) -> dict[str, Any]:
    """A ready-made project owned by the default owner."""
    return make_project()


# --------------------------------------------------------------------------- #
# Binary fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def png_bytes() -> bytes:
    return ONE_PIXEL_PNG


@pytest.fixture()
def uploaded_files(settings: Settings) -> Callable[[], list[Path]]:
    """List files written to the upload dir, to assert on disk side effects."""

    def _list() -> list[Path]:
        return sorted(p for p in Path(settings.upload_dir).rglob("*") if p.is_file())

    return _list
