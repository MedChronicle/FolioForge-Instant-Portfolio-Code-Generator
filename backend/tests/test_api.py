import base64

from fastapi.testclient import TestClient


ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def portfolio_config() -> dict:
    return {
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


def test_health_and_templates(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {
        "status": "ok",
        "storage": "memory",
        "environment": "test",
    }

    templates = client.get("/api/templates")
    assert templates.status_code == 200
    assert {item["id"] for item in templates.json()} == {
        "creative-editorial",
        "minimal-professional",
        "dark-futuristic",
        "developer-terminal",
        "modern-glass",
        "playful-experimental",
    }


def test_project_lifecycle_and_owner_isolation(client: TestClient) -> None:
    headers = {"X-User-Id": "ada"}
    created = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Ada portfolio", "config": portfolio_config()},
    )
    assert created.status_code == 201
    project = created.json()
    project_id = project["id"]
    assert project["owner_id"] == "ada"

    listed = client.get("/api/projects", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project_id]

    other_owner = client.get(
        f"/api/projects/{project_id}",
        headers={"X-User-Id": "someone-else"},
    )
    assert other_owner.status_code == 404

    updated = client.patch(
        f"/api/projects/{project_id}",
        headers=headers,
        json={"name": "Ada portfolio v2"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Ada portfolio v2"

    duplicated = client.post(
        f"/api/projects/{project_id}/duplicate",
        headers=headers,
        json={"name": "Ada portfolio copy"},
    )
    assert duplicated.status_code == 201
    assert duplicated.json()["name"] == "Ada portfolio copy"
    assert duplicated.json()["config"] == updated.json()["config"]

    exported = client.get(f"/api/projects/{project_id}/export", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/json")
    assert exported.json()["id"] == project_id
    assert "attachment" in exported.headers["content-disposition"]

    deleted = client.delete(f"/api/projects/{project_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/projects/{project_id}", headers=headers).status_code == 404


def test_validation_rejects_unsafe_links(client: TestClient) -> None:
    response = client.post(
        "/api/projects",
        json={
            "name": "Invalid",
            "config": {
                **portfolio_config(),
                "social_links": [{"platform": "Bad", "url": "javascript:alert(1)"}],
            },
        },
    )
    assert response.status_code == 422


def test_image_upload_is_saved_and_served(client: TestClient) -> None:
    response = client.post(
        "/api/uploads",
        files={"file": ("avatar.png", ONE_PIXEL_PNG, "image/png")},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["content_type"] == "image/png"
    assert payload["size"] == len(ONE_PIXEL_PNG)

    served = client.get(payload["url"])
    assert served.status_code == 200
    assert served.content == ONE_PIXEL_PNG
