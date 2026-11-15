import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Final, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_ORIGIN_RE: Final = re.compile(r"^https?://[^/\s]+$")
_DB_NAME_RE: Final = re.compile(r"^[A-Za-z0-9_-]{1,63}$")
_MONGO_SCHEMES: Final = ("mongodb://", "mongodb+srv://")
MAX_UPLOAD_LIMIT: Final[int] = 100 * 1024 * 1024


class Settings(BaseSettings):
    """Runtime configuration for the FolioForge API.

    The API deliberately works without a database in development. Set
    ``MONGODB_URL`` when a durable MongoDB store is available (required in
    production).
    """

    app_name: str = Field(default="FolioForge API", min_length=1, max_length=100)
    environment: Literal["development", "test", "production"] = "development"
    # repr=False keeps credentials embedded in the URL out of logs and tracebacks.
    mongodb_url: str | None = Field(default=None, repr=False)
    mongodb_database: str = "folioforge"
    # NoDecode stops pydantic-settings from forcing JSON on this env var, so both
    # "a,b" and '["a","b"]' work (needs pydantic-settings >= 2.7).
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )
    upload_dir: Path = Path("uploads")
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, gt=0, le=MAX_UPLOAD_LIMIT)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        frozen=True,  # settings never change after startup
    )

    # ------------------------------------------------------------------ #
    # Validators
    # ------------------------------------------------------------------ #

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                try:
                    return json.loads(text)
                except json.JSONDecodeError as exc:
                    raise ValueError("CORS_ORIGINS is not valid JSON") from exc
            return [origin.strip() for origin in text.split(",") if origin.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def normalize_cors_origins(cls, value: list[str]) -> list[str]:
        cleaned: dict[str, None] = {}  # ordered de-duplication
        for origin in value:
            origin = origin.strip().rstrip("/")
            if origin != "*" and not _ORIGIN_RE.fullmatch(origin):
                raise ValueError(
                    f"Invalid CORS origin {origin!r}; expected e.g. https://example.com"
                )
            cleaned.setdefault(origin)
        return list(cleaned)

    @field_validator("mongodb_url", mode="before")
    @classmethod
    def blank_url_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("mongodb_url")
    @classmethod
    def validate_mongodb_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(_MONGO_SCHEMES):
            raise ValueError("MONGODB_URL must start with mongodb:// or mongodb+srv://")
        return value

    @field_validator("mongodb_database")
    @classmethod
    def validate_database_name(cls, value: str) -> str:
        if not _DB_NAME_RE.fullmatch(value):
            raise ValueError(
                "MONGODB_DATABASE must be 1-63 characters: letters, digits, _ or -"
            )
        return value

    @field_validator("upload_dir")
    @classmethod
    def absolute_upload_dir(cls, value: Path) -> Path:
        return value.expanduser().resolve()

    @model_validator(mode="after")
    def enforce_production_rules(self) -> "Settings":
        if self.environment == "production":
            if self.mongodb_url is None:
                raise ValueError("MONGODB_URL is required when ENVIRONMENT=production")
            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS origins are not allowed in production")
        return self

    # ------------------------------------------------------------------ #
    # Convenience
    # ------------------------------------------------------------------ #

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def uses_mongodb(self) -> bool:
        return self.mongodb_url is not None

    def ensure_directories(self) -> None:
        """Create runtime directories; call once at application startup."""
        self.upload_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
