from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable

import pytest
from fastapi.testclient import TestClient

from app.config import Settings

pytestmark = pytest.mark.filterwarnings("error::pytest.PytestUnraisableExceptionWarning")

TEMPLATE_IDS = frozenset(
    {
        "creative-editorial",
        "minimal-professional",
        "dark-futuristic",
        "developer-terminal",
        "modern-glass",
        "playful-experimental",
    }
)
MISSING_ID = "00000000-0000-0000-0000-000000000000"
REJECTED_UPLOAD_STATUSES = {400, 413, 415, 422}

UNSAFE_URLS = [
    pytest.param("javascript:alert(1)", id="javascript"),
    pytest.param("JaVaScRiPt:alert(1)", id="javascript-mixed-case"),
    pytest.param("  javascript:alert(1)", id="javascript-leading-space"),
    pytest.param("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", id="data"),
    pytest.param("vbscript:msgbox(1)", id="vbscript"),
    pytest.param("file:///etc/passwd", id="file"),
]

# Assumption-bearing tests are marked so a failure reads as "contract mismatch",
# not "regression". Run only the firm tests with: pytest -m "not assumption"
assumption = pytest.mark.assumption


@pytest.fixture()
def upload(client: TestClient, png_bytes: bytes) -> Callable[..., Any]:
    def _upload(
        filename: str = "avatar.png",
        content: bytes | None = None,
        content_type: str = "image/png",
    ):
        return client.post(
            "/api/uploads",
            files={"file": (filename, png_bytes if content is None else content, content_type)},
        )

    return _upload


# --------------------------------------------------------------------------- #
# Health, templates, CORS
# --------------------------------------------------------------------------- #
def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "storage": "memory", "environment": "test"}


def test_templates_catalogue(client: TestClient) -> None:
    response = client.get("/api/templates")
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert set(ids) == TEMPLATE_IDS
    assert len(ids) == len(set(ids)), "template ids must be unique"


@pytest.mark.parametrize("template_id", sorted(TEMPLATE_IDS))
def test_every_template_is_accepted(make_project, template_id: str) -> None:
    assert make_project(template_id=template_id)["config"]["template_id"] == template_id


@assumption
def test_cors_allows_configured_origin_only(client_factory) -> None:
    client = client_factory(cors_origins=["https://portfolio.example.com"])
    preflight_headers = {"Access-Control-Request-Method": "POST"}

    allowed = client.options(
        "/api/projects",
        headers={**preflight_headers, "Origin": "https://portfolio.example.com"},
    )
    denied = client.options(
        "/api/projects",
        headers={**preflight_headers, "Origin": "https://evil.example.com"},
    )

    assert allowed.headers.get("access-control-allow-origin") == "https://portfolio.example.com"
    assert "access-control-allow-origin" not in denied.headers


# --------------------------------------------------------------------------- #
# Project lifecycle
# --------------------------------------------------------------------------- #
def test_project_lifecycle(client: TestClient, project: dict, owner_headers: dict) -> None:
    project_id = project["id"]
    assert project["owner_id"] == "ada"

    listed = client.get("/api/projects", headers=owner_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project_id]

    fetched = client.get(f"/api/projects/{project_id}", headers=owner_headers)
    assert fetched.status_code == 200
    assert fetched.json() == project

    updated = client.patch(
        f"/api/projects/{project_id}", headers=owner_headers, json={"name": "Ada portfolio v2"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Ada portfolio v2"
    assert updated.json()["config"] == project["config"], "rename must not touch config"

    duplicated = client.post(
        f"/api/projects/{project_id}/duplicate",
        headers=owner_headers,
        json={"name": "Ada portfolio copy"},
    )
    assert duplicated.status_code == 201
    clone = duplicated.json()
    assert clone["id"] != project_id
    assert clone["name"] == "Ada portfolio copy"
    assert clone["config"] == updated.json()["config"]
    assert clone["owner_id"] == project["owner_id"]

    assert client.delete(f"/api/projects/{project_id}", headers=owner_headers).status_code == 204
    assert client.get(f"/api/projects/{project_id}", headers=owner_headers).status_code == 404

    remaining = client.get("/api/projects", headers=owner_headers).json()
    assert [item["id"] for item in remaining] == [clone["id"]]


def test_export_is_a_faithful_attachment(
    client: TestClient, project: dict, owner_headers: dict
) -> None:
    response = client.get(f"/api/projects/{project['id']}/export", headers=owner_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment" in response.headers["content-disposition"]
    assert response.json() == project, "export must match the stored project exactly"


def test_patch_config_replaces_content(
    client: TestClient, project: dict, owner_headers: dict, make_config
) -> None:
    response = client.patch(
        f"/api/projects/{project['id']}",
        headers=owner_headers,
        json={"config": make_config(full_name="Grace Hopper", skills=["COBOL"])},
    )
    assert response.status_code == 200
    config = response.json()["config"]
    assert config["full_name"] == "Grace Hopper"
    assert config["skills"] == ["COBOL"]


def test_duplicate_is_independent_of_original(
    client: TestClient, project: dict, owner_headers: dict, make_config
) -> None:
    clone = client.post(
        f"/api/projects/{project['id']}/duplicate", headers=owner_headers, json={"name": "Copy"}
    ).json()

    client.patch(
        f"/api/projects/{clone['id']}",
        headers=owner_headers,
        json={"config": make_config(full_name="Changed")},
    )

    original = client.get(f"/api/projects/{project['id']}", headers=owner_headers).json()
    assert original["config"]["full_name"] == "Ada Lovelace"


def test_delete_is_not_idempotent_but_safe(
    client: TestClient, project: dict, owner_headers: dict
) -> None:
    url = f"/api/projects/{project['id']}"
    assert client.delete(url, headers=owner_headers).status_code == 204
    assert client.delete(url, headers=owner_headers).status_code == 404


def test_unicode_round_trip(client: TestClient, make_project, owner_headers: dict) -> None:
    created = make_project(
        name="Портфолио 🚀",
        full_name="Ada Łovelace-Çelik",
        skills=["日本語", "Zażółć gęślą jaźń"],
    )
    fetched = client.get(f"/api/projects/{created['id']}", headers=owner_headers).json()
    assert fetched["name"] == "Портфолио 🚀"
    assert fetched["config"]["full_name"] == "Ada Łovelace-Çelik"
    assert fetched["config"]["skills"] == ["日本語", "Zażółć gęślą jaźń"]


def test_ids_are_unique_under_concurrent_creation(client: TestClient, make_project) -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        created = list(pool.map(lambda i: make_project(name=f"p{i}"), range(24)))

    ids = [item["id"] for item in created]
    assert len(set(ids)) == len(ids)
    listed = client.get("/api/projects", headers={"X-User-Id": "ada"}).json()
    assert {item["id"] for item in listed} == set(ids)


# --------------------------------------------------------------------------- #
# Owner isolation
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("method", "path_template", "body"),
    [
        pytest.param("get", "/api/projects/{id}", None, id="get"),
        pytest.param("patch", "/api/projects/{id}", {"name": "hijacked"}, id="patch"),
        pytest.param("delete", "/api/projects/{id}", None, id="delete"),
        pytest.param("post", "/api/projects/{id}/duplicate", {"name": "stolen"}, id="duplicate"),
        pytest.param("get", "/api/projects/{id}/export", None, id="export"),
    ],
)
def test_other_owner_cannot_access_project(
    client: TestClient,
    project: dict,
    owner_headers: dict,
    intruder_headers: dict,
    method: str,
    path_template: str,
    body: dict | None,
) -> None:
    kwargs: dict[str, Any] = {"headers": intruder_headers}
    if body is not None:
        kwargs["json"] = body

    response = client.request(method, path_template.format(id=project["id"]), **kwargs)
    assert response.status_code == 404, "must be 404, not 403, so existence is not leaked"

    unchanged = client.get(f"/api/projects/{project['id']}", headers=owner_headers)
    assert unchanged.status_code == 200
    assert unchanged.json() == project

    # An intruder's failed duplicate must not have created anything for them either.
    assert client.get("/api/projects", headers=intruder_headers).json() == []


def test_404_body_is_identical_for_missing_and_foreign(
    client: TestClient, project: dict, intruder_headers: dict
) -> None:
    foreign = client.get(f"/api/projects/{project['id']}", headers=intruder_headers)
    missing = client.get(f"/api/projects/{MISSING_ID}", headers=intruder_headers)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_listing_only_returns_own_projects(
    client: TestClient, make_project, owner_headers: dict, intruder_headers: dict
) -> None:
    mine = make_project(name="Mine")
    make_project(name="Theirs", headers=intruder_headers)

    listed = client.get("/api/projects", headers=owner_headers).json()
    assert [item["id"] for item in listed] == [mine["id"]]


@assumption
def test_requests_without_identity_header_are_isolated(
    client: TestClient, make_config, project: dict
) -> None:
    anonymous = client.post("/api/projects", json={"name": "Anon", "config": make_config()})
    assert anonymous.status_code in {201, 401}
    if anonymous.status_code == 201:
        assert anonymous.json()["owner_id"] != project["owner_id"]
        assert client.get(f"/api/projects/{project['id']}").status_code == 404


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_unknown_project_returns_404(client: TestClient, owner_headers: dict, method: str) -> None:
    kwargs: dict[str, Any] = {"headers": owner_headers}
    if method == "patch":
        kwargs["json"] = {"name": "x"}
    assert client.request(method, f"/api/projects/{MISSING_ID}", **kwargs).status_code == 404


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("url", UNSAFE_URLS)
def test_rejects_unsafe_social_links(client: TestClient, make_config, url: str) -> None:
    config = make_config(social_links=[{"platform": "Bad", "url": url}])
    assert client.post("/api/projects", json={"name": "Invalid", "config": config}).status_code == 422


@pytest.mark.parametrize("url", UNSAFE_URLS)
def test_rejects_unsafe_repo_urls(client: TestClient, make_config, url: str) -> None:
    config = make_config()
    config["projects"][0]["repo_url"] = url
    assert client.post("/api/projects", json={"name": "Invalid", "config": config}).status_code == 422


@pytest.mark.parametrize("url", ["https://github.com/ada", "http://example.com/a?b=c#d"])
def test_accepts_http_and_https_links(make_project, url: str) -> None:
    project = make_project(social_links=[{"platform": "Site", "url": url}])
    assert project["config"]["social_links"][0]["url"].startswith("http")


@pytest.mark.parametrize(
    ("field", "value"),
    [
        pytest.param("template_id", "does-not-exist", id="unknown-template"),
        pytest.param("email", "not-an-email", id="bad-email"),
        pytest.param("full_name", "", id="empty-name"),
        pytest.param("skills", "Python", id="skills-not-a-list"),
        pytest.param("projects", {"title": "x"}, id="projects-not-a-list"),
    ],
)
def test_rejects_bad_fields(client: TestClient, make_config, field: str, value: Any) -> None:
    config = make_config(**{field: value})
    assert client.post("/api/projects", json={"name": "Invalid", "config": config}).status_code == 422


def test_422_identifies_the_offending_field(client: TestClient, make_config) -> None:
    response = client.post(
        "/api/projects", json={"name": "Invalid", "config": make_config(email="nope")}
    )
    assert response.status_code == 422
    locations = [".".join(map(str, err["loc"])) for err in response.json()["detail"]]
    assert any(loc.endswith("email") for loc in locations)


def test_rejects_missing_name(client: TestClient, make_config) -> None:
    assert client.post("/api/projects", json={"config": make_config()}).status_code == 422


def test_rejects_malformed_json_body(client: TestClient) -> None:
    response = client.post(
        "/api/projects", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422


def test_failed_patch_leaves_project_unchanged(
    client: TestClient, project: dict, owner_headers: dict, make_config
) -> None:
    bad = client.patch(
        f"/api/projects/{project['id']}",
        headers=owner_headers,
        json={"config": make_config(email="nope")},
    )
    assert bad.status_code == 422
    assert client.get(f"/api/projects/{project['id']}", headers=owner_headers).json() == project


def test_failed_validation_persists_nothing(
    client: TestClient, make_config, owner_headers: dict
) -> None:
    client.post(
        "/api/projects",
        headers=owner_headers,
        json={"name": "Invalid", "config": make_config(email="not-an-email")},
    )
    assert client.get("/api/projects", headers=owner_headers).json() == []


# --------------------------------------------------------------------------- #
# Uploads
# --------------------------------------------------------------------------- #
def test_image_upload_is_saved_and_served(
    client: TestClient, upload, png_bytes: bytes, uploaded_files
) -> None:
    response = upload()
    assert response.status_code == 201

    payload = response.json()
    assert payload["content_type"] == "image/png"
    assert payload["size"] == len(png_bytes)
    assert len(uploaded_files()) == 1, "exactly one file should land on disk"

    served = client.get(payload["url"])
    assert served.status_code == 200
    assert served.content == png_bytes
    assert served.headers["content-type"].startswith("image/png")


def test_uploads_get_unique_urls(upload) -> None:
    urls = {upload().json()["url"] for _ in range(5)}
    assert len(urls) == 5


def test_same_filename_does_not_overwrite(client: TestClient, upload, png_bytes: bytes) -> None:
    other = png_bytes + b"\x00"
    first = upload(filename="same.png").json()
    second = upload(filename="same.png", content=other).json()
    assert client.get(first["url"]).content == png_bytes
    assert client.get(second["url"]).content == other


@pytest.mark.parametrize(
    ("filename", "content", "content_type"),
    [
        pytest.param("notes.txt", b"just text", "text/plain", id="text"),
        pytest.param("script.js", b"alert(1)", "application/javascript", id="javascript"),
        pytest.param("page.html", b"<script>alert(1)</script>", "text/html", id="html"),
        pytest.param("logo.svg", b"<svg onload=alert(1)/>", "image/svg+xml", id="svg-xss"),
    ],
)
def test_upload_rejects_non_images(
    upload, uploaded_files, filename: str, content: bytes, content_type: str
) -> None:
    assert upload(filename, content, content_type).status_code in REJECTED_UPLOAD_STATUSES
    assert uploaded_files() == [], "rejected uploads must leave nothing on disk"


def test_upload_rejects_empty_file(upload, uploaded_files) -> None:
    assert upload(content=b"").status_code in REJECTED_UPLOAD_STATUSES
    assert uploaded_files() == []


@assumption
def test_upload_rejects_spoofed_content_type(upload, uploaded_files) -> None:
    """Declares image/png but the bytes are HTML; needs magic-byte sniffing."""
    response = upload("evil.png", b"<script>alert(1)</script>", "image/png")
    assert response.status_code in REJECTED_UPLOAD_STATUSES
    assert uploaded_files() == []


@pytest.mark.parametrize(
    "filename",
    ["../../evil.png", "..\\..\\evil.png", "/etc/passwd.png", "a/b/c.png", "nul\x00.png"],
)
def test_upload_filename_cannot_escape_upload_dir(
    upload, settings: Settings, uploaded_files, filename: str
) -> None:
    response = upload(filename=filename)
    assert response.status_code in {201, *REJECTED_UPLOAD_STATUSES}

    root = Path(settings.upload_dir).resolve()
    for written in uploaded_files():
        assert root in written.resolve().parents, f"{written} escaped {root}"


def test_upload_without_file_field_is_rejected(client: TestClient) -> None:
    assert client.post("/api/uploads").status_code == 422


def test_unknown_upload_url_returns_404(client: TestClient, upload) -> None:
    url = upload().json()["url"]
    missing = url.rsplit("/", 1)[0] + "/does-not-exist.png"
    assert client.get(missing).status_code == 404
