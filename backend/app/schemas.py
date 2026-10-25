from __future__ import annotations

import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
OWNER_ID = re.compile(r"^[a-zA-Z0-9._:@-]{1,64}$")
SECTION_IDS = {
    "about",
    "projects",
    "experience",
    "photo-strip",
    "skills",
    "gallery",
    "contact",
}


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


def _validate_url(value: str | None, *, allow_relative: bool = True) -> str | None:
    if value is None or value == "":
        return value
    if allow_relative and value.startswith("/"):
        return value

    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https", "mailto"}:
        raise ValueError("URL must use http, https, or mailto")
    if parsed.scheme != "mailto" and not parsed.netloc:
        raise ValueError("URL must include a host")
    return value


def _validate_asset_url(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    if value.startswith("/"):
        return value
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Image URL must be a relative path or an http(s) URL")
    return value


class SocialLink(BaseModel):
    platform: str = Field(min_length=1, max_length=40)
    url: str = Field(min_length=1, max_length=500)

    _strip_platform = field_validator("platform", mode="before")(_strip)

    @field_validator("url")
    @classmethod
    def validate_social_url(cls, value: str) -> str:
        return _validate_url(value, allow_relative=False) or value


class PortfolioProject(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2_000)
    image_url: str | None = Field(default=None, max_length=1_000)
    tags: list[str] = Field(default_factory=list, max_length=12)
    live_url: str | None = Field(default=None, max_length=500)
    repo_url: str | None = Field(default=None, max_length=500)

    _strip_text = field_validator("title", "description", mode="before")(_strip)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized = [tag.strip() for tag in value if tag.strip()]
        if any(len(tag) > 40 for tag in normalized):
            raise ValueError("Project tags must be 40 characters or fewer")
        return list(dict.fromkeys(normalized))

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        return _validate_asset_url(value)

    @field_validator("live_url", "repo_url")
    @classmethod
    def validate_project_url(cls, value: str | None) -> str | None:
        return _validate_url(value, allow_relative=False)


class ExperienceItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=80)
    date_range: str = Field(default="", max_length=100)
    role: str = Field(min_length=1, max_length=120)
    organization: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=2_000)
    tags: list[str] = Field(default_factory=list, max_length=12)
    url: str | None = Field(default=None, max_length=500)

    _strip_text = field_validator(
        "date_range", "role", "organization", "description", mode="before"
    )(_strip)

    @field_validator("url")
    @classmethod
    def validate_experience_url(cls, value: str | None) -> str | None:
        return _validate_url(value, allow_relative=False)


class EducationItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=80)
    period: str = Field(default="", max_length=100)
    school: str = Field(min_length=1, max_length=160)
    program: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=1_000)
    url: str | None = Field(default=None, max_length=500)

    _strip_text = field_validator(
        "period", "school", "program", "description", mode="before"
    )(_strip)

    @field_validator("url")
    @classmethod
    def validate_education_url(cls, value: str | None) -> str | None:
        return _validate_url(value, allow_relative=False)


class GalleryItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=80)
    image_url: str = Field(min_length=1, max_length=1_000)
    alt: str = Field(default="", max_length=240)
    caption: str = Field(default="", max_length=240)

    _strip_text = field_validator("alt", "caption", mode="before")(_strip)

    @field_validator("image_url")
    @classmethod
    def validate_gallery_image_url(cls, value: str) -> str:
        return _validate_asset_url(value) or value


class SectionConfig(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    visible: bool = True

    @field_validator("id")
    @classmethod
    def validate_section_id(cls, value: str) -> str:
        if value not in SECTION_IDS:
            raise ValueError(f"Unknown section id: {value}")
        return value


def _default_sections() -> list[SectionConfig]:
    return [SectionConfig(id=section_id) for section_id in (
        "about",
        "projects",
        "experience",
        "photo-strip",
        "skills",
        "gallery",
        "contact",
    )]


class ThemeSettings(BaseModel):
    background_color: str = "#f6f0e7"
    accent_color: str = "#315c42"
    text_color: str = "#1f1f1f"
    muted_color: str = "#6d6a63"
    heading_font: str = Field(default="Space Grotesk", max_length=100)
    body_font: str = Field(default="Inter", max_length=100)
    animation_intensity: Literal["reduced", "subtle", "expressive"] = "expressive"
    content_width: Literal["compact", "comfortable", "wide"] = "comfortable"

    @field_validator("background_color", "accent_color", "text_color", "muted_color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        if not HEX_COLOR.fullmatch(value):
            raise ValueError("Colors must be six-digit hex values such as #315c42")
        return value.lower()

    _strip_fonts = field_validator("heading_font", "body_font", mode="before")(_strip)


class PortfolioConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: str = Field(default="creative-editorial", min_length=1, max_length=80)
    full_name: str = Field(default="", max_length=160)
    handle: str = Field(default="", max_length=80)
    professional_title: str = Field(default="", max_length=160)
    short_intro: str = Field(default="", max_length=500)
    bio: str = Field(default="", max_length=5_000)
    location: str = Field(default="", max_length=120)
    email: str | None = Field(default=None, max_length=320)
    resume_url: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=1_000)
    social_links: list[SocialLink] = Field(default_factory=list, max_length=12)
    skills: list[str] = Field(default_factory=list, max_length=40)
    projects: list[PortfolioProject] = Field(default_factory=list, max_length=40)
    experience: list[ExperienceItem] = Field(default_factory=list, max_length=40)
    education: list[EducationItem] = Field(default_factory=list, max_length=20)
    gallery: list[GalleryItem] = Field(default_factory=list, max_length=60)
    sections: list[SectionConfig] = Field(default_factory=_default_sections, max_length=12)
    theme: ThemeSettings = Field(default_factory=ThemeSettings)

    _strip_text = field_validator(
        "template_id",
        "full_name",
        "handle",
        "professional_title",
        "short_intro",
        "bio",
        "location",
        mode="before",
    )(_strip)

    @field_validator("skills")
    @classmethod
    def normalize_skills(cls, value: list[str]) -> list[str]:
        normalized = [skill.strip() for skill in value if skill.strip()]
        if any(len(skill) > 60 for skill in normalized):
            raise ValueError("Skills must be 60 characters or fewer")
        return list(dict.fromkeys(normalized))

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("email must be a valid email address")
        return value.strip()

    @field_validator("resume_url")
    @classmethod
    def validate_resume_url(cls, value: str | None) -> str | None:
        return _validate_url(value, allow_relative=False)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: str | None) -> str | None:
        return _validate_asset_url(value)

    @model_validator(mode="after")
    def validate_sections_are_unique(self) -> PortfolioConfig:
        section_ids = [section.id for section in self.sections]
        if len(section_ids) != len(set(section_ids)):
            raise ValueError("sections must contain each section id at most once")
        return self


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    config: PortfolioConfig

    _strip_name = field_validator("name", mode="before")(_strip)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    config: PortfolioConfig | None = None

    _strip_name = field_validator("name", mode="before")(_strip)


class ProjectRecord(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    created_at: datetime
    updated_at: datetime


class DuplicateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)

    _strip_name = field_validator("name", mode="before")(_strip)


class TemplateDefinition(BaseModel):
    id: str
    name: str
    description: str
    tone: str
    supports_dark_mode: bool
    supports_3d_motion: bool


class HealthResponse(BaseModel):
    status: Literal["ok"]
    storage: Literal["memory", "mongodb"]
    environment: str


class UploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str
    size: int


class OwnerId(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def validate_owner_id(cls, value: str) -> str:
        if not OWNER_ID.fullmatch(value):
            raise ValueError("owner id contains unsupported characters")
        return value
