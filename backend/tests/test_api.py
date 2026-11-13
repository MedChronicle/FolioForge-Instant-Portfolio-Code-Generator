from __future__ import annotations

import base64
import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

TEMPLATE_IDS = {
    "creative-editorial",
    "minimal-professional",
    "dark-futuristic",
    "developer-terminal",
    "modern-glass",
    "playful-experimental",
}

OWNER = {"X-User-Id": "ada"}
INTRUDER = {"X-User-Id": "someone-else"}
MISSING_ID = "00000000-0000-0000-0000-000000000000"


# --------------------------------------------------------------------------- #
# Factories and helpers
# --------------------------------------------------------------------------- #
def portfolio_config(**overrides: Any) -> dict[str, Any]:
    """Build a valid portfolio config; top-level keys can be overridden."""
    config: dict[str, Any] = {
        "template_id": "creative-editorial",
        "full_name": "Ada Lovelace",
        "professional_title": "Computing pioneer",
        "short_intro": "Building thoughtful tools.",
        "bio": "A short biography.",
        "email": "ada@example.com",
        "social_links": [
            {"platform": "GitHub", "url": "https://github.com/ada"},
        ],
        "skills": ["Python", "Systems design"],
        "projects": [
            {
                "title": "Analytical Engine",
                "description": "A project description.",
                "tags": ["Research"],
                "repo_url": "https://github.com/ada/engine",
            },
        ],
    }
    return copy.deepcopy({**config, **overrides})


def create_project(
    client: TestClient,
    name: str = "Ada portfolio",
    headers: dict[str, str] | None = None,
    **config_overrides: Any,
) -> dict[str, Any]:
    """Create a project, assert success, and return its JSON body."""
    response = client.post(
        "/api/projects",
        headers=headers or OWNER,
        json={"name": name, "config": portfolio_config(**config_overrides)},
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload(
    client: TestClient,
    filename: str = "avatar.png",
    content: bytes = ONE_PIXEL_PNG,
    content_type: str = "image/png",
):
    return client.post(
        "/api/uploads",
        files={"file": (filename, content, content_type)},
    )


# --------------------------------------------------------------------------- #
# Health and templates
# --------------------------------------------------------------------------- #
def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "storage": "memory",
        "environment": "test",
    }


def test_templates_catalogue(client: TestClient) -> None:
    response = client.get("/api/templates")
    assert response.status_code == 200
    templates = response.json()
    assert {item["id"] for item in templates} == TEMPLATE_IDS
    assert len(templates) == len(TEMPLATE_IDS), "template ids must be unique"


@pytest.mark.parametrize("template_id", sorted(TEMPLATE_IDS))
def test_every_template_is_accepted(client: TestClient, template_id: str) -> None:
    project = create_project(client, template_id=template_id)
    assert project["config"]["template_id"] == template_id


# --------------------------------------------------------------------------- #
# Project lifecycle
# --------------------------------------------------------------------------- #
def test_project_lifecycle(client: TestClient) -> None:
    project = create_project(client)
    project_id = project["id"]
    assert project["owner_id"] == "ada"

    listed = client.get("/api/projects", headers=OWNER)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project_id]

    fetched = client.get(f"/api/projects/{project_id}", headers=OWNER)
    assert fetched.status_code == 200
    assert fetched.json() == project

    updated = client.patch(
        f"/api/projects/{project_id}",
        headers=OWNER,
        json={"name": "Ada portfolio v2"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Ada portfolio v2"
    assert updated.json()["config"] == project["config"], "rename must not touch config"

    duplicated = client.post(
        f"/api/projects/{project_id}/duplicate",
        headers=OWNER,
        json={"name": "Ada portfolio copy"},
    )
    assert duplicated.status_code == 201
    copy_body = duplicated.json()
    assert copy_body["id"] != project_id
    assert copy_body["name"] == "Ada portfolio copy"
    assert copy_body["config"] == updated.json()["config"]

    exported = client.get(f"/api/projects/{project_id}/export", headers=OWNER)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/json")
    assert exported.json()["id"] == project_id
    assert "attachment" in exported.headers["content-disposition"]

    assert client.delete(f"/api/projects/{project_id}", headers=OWNER).status_code == 204
    assert client.get(f"/api/projects/{project_id}", headers=OWNER).status_code == 404

    # Deleting the original must not delete the duplicate.
    remaining = client.get("/api/projects", headers=OWNER).json()
    assert [item["id"] for item in remaining] == [copy_body["id"]]


def test_patch_config_replaces_content(client: TestClient) -> None:
    project = create_project(client)
    new_config = portfolio_config(full_name="Grace Hopper", skills=["COBOL"])

    response = client.patch(
        f"/api/projects/{project['id']}",
        headers=OWNER,
        json={"config": new_config},
    )
    assert response.status_code == 200
    assert response.json()["config"]["full_name"] == "Grace Hopper"
    assert response.json()["config"]["skills"] == ["COBOL"]


def test_duplicate_is_independent_of_original(client: TestClient) -> None:
    original = create_project(client)
    duplicate = client.post(
        f"/api/projects/{original['id']}/duplicate",
        headers=OWNER,
        json={"name": "Copy"},
    ).json()

    client.patch(
        f"/api/projects/{duplicate['id']}",
        headers=OWNER,
        json={"config": portfolio_config(full_name="Changed")},
    )

    untouched = client.get(f"/api/projects/{original['id']}", headers=OWNER).json()
    assert untouched["config"]["full_name"] == "Ada Lovelace"


# --------------------------------------------------------------------------- #
# Owner isolation: every project endpoint must hide other users' projects
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("method", "path_template", "body"),
    [
        ("get", "/api/projects/{id}", None),
        ("patch", "/api/projects/{id}", {"name": "hijacked"}),
        ("delete", "/api/projects/{id}", None),
        ("post", "/api/projects/{id}/duplicate", {"name": "stolen"}),
        ("get", "/api/projects/{id}/export", None),
    ],
    ids=["get", "patch", "delete", "duplicate", "export"],
)
def test_other_owner_cannot_access_project(
    client: TestClient,
    method: str,
    path_template: str,
    body: dict[str, Any] | None,
) -> None:
    project = create_project(client)
    kwargs: dict[str, Any] = {"headers": INTRUDER}
    if body is not None:
        kwargs["json"] = body

    response = client.request(method, path_template.format(id=project["id"]), **kwargs)
    assert response.status_code == 404

    # The real owner's project must be completely unchanged.
    still_there = client.get(f"/api/projects/{project['id']}", headers=OWNER)
    assert still_there.status_code == 200
    assert still_there.json()["name"] == project["name"]


def test_listing_only_returns_own_projects(client: TestClient) -> None:
    mine = create_project(client, name="Mine", headers=OWNER)
    create_project(client, name="Theirs", headers=INTRUDER)

    listed = client.get("/api/projects", headers=OWNER).json()
    assert [item["id"] for item in listed] == [mine["id"]]


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_unknown_project_returns_404(client: TestClient, method: str) -> None:
    kwargs: dict[str, Any] = {"headers": OWNER}
    if method == "patch":
        kwargs["json"] = {"name": "x"}
    response = client.request(method, f"/api/projects/{MISSING_ID}", **kwargs)
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
UNSAFE_URLS = [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
]


@pytest.mark.parametrize("url", UNSAFE_URLS)
def test_validation_rejects_unsafe_social_links(client: TestClient, url: str) -> None:
    response = client.post(
        "/api/projects",
        json={
            "name": "Invalid",
            "config": portfolio_config(social_links=[{"platform": "Bad", "url": url}]),
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("url", UNSAFE_URLS)
def test_validation_rejects_unsafe_repo_urls(client: TestClient, url: str) -> None:
    config = portfolio_config()
    config["projects"][0]["repo_url"] = url
    response = client.post("/api/projects", json={"name": "Invalid", "config": config})
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("template_id", "does-not-exist"),
        ("email", "not-an-email"),
        ("full_name", ""),
    ],
)
def test_validation_rejects_bad_fields(
    client: TestClient, field: str, value: str
) -> None:
    response = client.post(
        "/api/projects",
        json={"name": "Invalid", "config": portfolio_config(**{field: value})},
    )
    assert response.status_code == 422


def test_validation_rejects_missing_name(client: TestClient) -> None:
    response = client.post("/api/projects", json={"config": portfolio_config()})
    assert response.status_code == 422


def test_failed_validation_does_not_persist_anything(client: TestClient) -> None:
    client.post(
        "/api/projects",
        headers=OWNER,
        json={
            "name": "Invalid",
            "config": portfolio_config(email="not-an-email"),
        },
    )
    assert client.get("/api/projects", headers=OWNER).json() == []


# --------------------------------------------------------------------------- #
# Uploads
# --------------------------------------------------------------------------- #
def test_image_upload_is_saved_and_served(client: TestClient) -> None:
    response = upload(client)
    assert response.status_code == 201

    payload = response.json()
    assert payload["content_type"] == "image/png"
    assert payload["size"] == len(ONE_PIXEL_PNG)

    served = client.get(payload["url"])
    assert served.status_code == 200
    assert served.content == ONE_PIXEL_PNG
    assert served.headers["content-type"].startswith("image/png")


def test_uploads_get_unique_urls(client: TestClient) -> None:
    first = upload(client).json()["url"]
    second = upload(client).json()["url"]
    assert first != second


@pytest.mark.parametrize(
    ("filename", "content", "content_type"),
    [
        ("notes.txt", b"just text", "text/plain"),
        ("script.js", b"alert(1)", "application/javascript"),
        ("page.html", b"<script>alert(1)</script>", "text/html"),
    ],
)
def test_upload_rejects_non_images(
    client: TestClient, filename: str, content: bytes, content_type: str
) -> None:
    response = upload(client, filename, content, content_type)
    assert response.status_code in {400, 415, 422}


def test_upload_rejects_empty_file(client: TestClient) -> None:
    response = upload(client, content=b"")
    assert response.status_code in {400, 422}


def test_upload_without_file_field_is_rejected(client: TestClient) -> None:
    assert client.post("/api/uploads").status_code == 422
