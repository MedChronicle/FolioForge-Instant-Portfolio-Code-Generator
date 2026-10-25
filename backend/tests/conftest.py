from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def client(tmp_path) -> Iterator[TestClient]:
    settings = Settings(
        environment="test",
        upload_dir=tmp_path,
        cors_origins=["http://testserver"],
    )
    application = create_app(settings)
    with TestClient(application) as test_client:
        yield test_client
