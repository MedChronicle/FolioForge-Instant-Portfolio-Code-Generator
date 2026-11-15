from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Final, Literal, get_args
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

# --------------------------------------------------------------------------- #
# Constants (names kept for backwards compatibility with other modules)
# --------------------------------------------------------------------------- #

HEX_COLOR: Final = re.compile(r"^#[0-9a-fA-F]{6}$")
OWNER_ID: Final = re.compile(r"^[a-zA-Z0-9._:@-]{1,64}$")
EMAIL_RE: Final = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SectionId = Literal[
    "about",
    "projects",
    "experience",
    "photo-strip",
    "skills",
    "gallery",
    "contact",
]
DEFAULT_SECTION_ORDER: Final[tuple[str, ...]] = get_args(SectionId)
SECTION_IDS: Final[frozenset[str]] = frozenset(DEFAULT_SECTION_ORDER)

LINK_SCHEMES: Final = frozenset({"http", "https", "mailto"})
ASSET_SCHEMES: Final = frozenset({"http", "https"})


# --------------------------------------------------------------------------- #
# Reusable validators
# --------------------------------------------------------------------------- #

def _check_url(
    value: str | None,
    *,
    schemes: frozenset[str],
    allow_relative: bool,
    label: str,
) -> str | None:
    if not value:
        return value
    if any(ch.isspace() or ord(ch) < 32 for ch in value):
        raise ValueError(f"{label} must not contain whitespace or control characters")

    if value.startswith("/"):
        # Reject protocol-relative ("//evil.com") and backslash tricks.
        if allow_relative and not value.startswith("//") and "\\" not in value:
            return value
        raise ValueError(f"{label} must not be a relative or protocol-relative path")

    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    if scheme not in schemes:
        allowed = ", ".join(sorted(schemes))
        raise ValueError(f"{label} must use one of: {allowed}")
    if scheme == "mailto":
        if not parsed.path:
            raise ValueError(f"{label} must include an address")
    elif not parsed.netloc:
        raise ValueError(f"{label} must include a host")
    return value


def _link_url(value: str | None) -> str | None:
    return _check_url(value, schemes=LINK_SCHEMES, allow_relative=False, label="URL")


def _asset_url(value: str | None) -> str | None:
    return _check_url(
        value, schemes=ASSET_SCHEMES, allow_relative=True, label="Image URL"
    )


def _email(value: str | None) -> str | None:
    if not value:
        return value
    if not EMAIL_RE.fullmatch(value):
        raise ValueError("email must be a valid email address")
    return value


def _dedupe(values: Iterable[str]) -> list[str]:
    """Drop blanks and case-insensitive duplicates while preserving order."""
    seen: dict[str, str] = {}
    for item in values:
        if item:
            seen.setdefault(item.casefold(), item)
    return list(seen.values())


def _ensure_unique(label: str, ids: Iterable[str]) -> None:
    seen: set[str] = set()
    for item_id in ids:
        if item_id in seen:
            raise ValueError(f"{label} ids must be unique (duplicate: {item_id!r})")
        seen.add(item_id)


def _new_id() -> str:
    return uuid4().hex


# Annotated aliases: declare the rule once, reuse everywhere.
EntityId = Annotated[str, Field(min_length=1, max_length=80)]
LinkUrl = Annotated[str | None, AfterValidator(_link_url)]
AssetUrl = Annotated[str | None, AfterValidator(_asset_url)]
RequiredLinkUrl = Annotated[str, AfterValidator(_link_url)]
RequiredAssetUrl = Annotated[str, AfterValidator(_asset_url)]
OptionalEmail = Annotated[str | None, AfterValidator(_email)]
HexColor = Annotated[
    str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$", to_lower=True)
]
FontName = Annotated[
    str,
    StringConstraints(
        min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9 .'\-]*$"
    ),
]
Tags = Annotated[
    list[Annotated[str, StringConstraints(max_length=40)]],
    AfterValidator(_dedupe),
]
Skills = Annotated[
    list[Annotated[str, StringConstraints(max_length=60)]],
    AfterValidator(_dedupe),
]
OwnerIdStr = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9._:@-]{1,64}$")]


class APIModel(BaseModel):
    """Base for all schemas: every string is whitespace-stripped automatically."""

    model_config = ConfigDict(str_strip_whitespace=True)


# --------------------------------------------------------------------------- #
# Portfolio content
# --------------------------------------------------------------------------- #

class SocialLink(APIModel):
    platform: str = Field(min_length=1, max_length=40)
    url: RequiredLinkUrl = Field(min_length=1, max_length=500)


class PortfolioProject(APIModel):
    id: EntityId = Field(default_factory=_new_id)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2_000)
    image_url: AssetUrl = Field(default=None, max_length=1_000)
    tags: Tags = Field(default_factory=list, max_length=12)
    live_url: LinkUrl = Field(default=None, max_length=500)
    repo_url: LinkUrl = Field(default=None, max_length=500)


class ExperienceItem(APIModel):
    id: EntityId = Field(default_factory=_new_id)
    date_range: str = Field(default="", max_length=100)
    role: str = Field(min_length=1, max_length=120)
    organization: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=2_000)
    tags: Tags = Field(default_factory=list, max_length=12)
    url: LinkUrl = Field(default=None, max_length=500)


class EducationItem(APIModel):
    id: EntityId = Field(default_factory=_new_id)
    period: str = Field(default="", max_length=100)
    school: str = Field(min_length=1, max_length=160)
    program: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=1_000)
    url: LinkUrl = Field(default=None, max_length=500)


class GalleryItem(APIModel):
    id: EntityId = Field(default_factory=_new_id)
    image_url: RequiredAssetUrl = Field(min_length=1, max_length=1_000)
    alt: str = Field(default="", max_length=240)
    caption: str = Field(default="", max_length=240)


class SectionConfig(APIModel):
    id: SectionId
    visible: bool = True


def default_sections() -> list[SectionConfig]:
    return [SectionConfig(id=section_id) for section_id in DEFAULT_SECTION_ORDER]


class ThemeSettings(APIModel):
    background_color: HexColor = "#f6f0e7"
    accent_color: HexColor = "#315c42"
    text_color: HexColor = "#1f1f1f"
    muted_color: HexColor = "#6d6a63"
    heading_font: FontName = "Space Grotesk"
    body_font: FontName = "Inter"
    animation_intensity: Literal["reduced", "subtle", "expressive"] = "expressive"
    content_width: Literal["compact", "comfortable", "wide"] = "comfortable"


class PortfolioConfig(APIModel):
    model_config = ConfigDict(extra="forbid")

    template_id: str = Field(default="creative-editorial", min_length=1, max_length=80)
    full_name: str = Field(default="", max_length=160)
    handle: str = Field(default="", max_length=80)
    professional_title: str = Field(default="", max_length=160)
    short_intro: str = Field(default="", max_length=500)
    bio: str = Field(default="", max_length=5_000)
    location: str = Field(default="", max_length=120)
    email: OptionalEmail = Field(default=None, max_length=320)
    resume_url: LinkUrl = Field(default=None, max_length=500)
    avatar_url: AssetUrl = Field(default=None, max_length=1_000)
    social_links: list[SocialLink] = Field(default_factory=list, max_length=12)
    skills: Skills = Field(default_factory=list, max_length=40)
    projects: list[PortfolioProject] = Field(default_factory=list, max_length=40)
    experience: list[ExperienceItem] = Field(default_factory=list, max_length=40)
    education: list[EducationItem] = Field(default_factory=list, max_length=20)
    gallery: list[GalleryItem] = Field(default_factory=list, max_length=60)
    sections: list[SectionConfig] = Field(default_factory=default_sections, max_length=12)
    theme: ThemeSettings = Field(default_factory=ThemeSettings)

    @model_validator(mode="after")
    def validate_uniqueness(self) -> PortfolioConfig:
        _ensure_unique("section", (s.id for s in self.sections))
        _ensure_unique("project", (p.id for p in self.projects))
        _ensure_unique("experience", (e.id for e in self.experience))
        _ensure_unique("education", (e.id for e in self.education))
        _ensure_unique("gallery", (g.id for g in self.gallery))
        return self


# --------------------------------------------------------------------------- #
# API request / response models
# --------------------------------------------------------------------------- #

ProjectName = Annotated[str, Field(min_length=1, max_length=120)]


class ProjectCreate(APIModel):
    name: ProjectName
    config: PortfolioConfig


class ProjectUpdate(APIModel):
    name: ProjectName | None = None
    config: PortfolioConfig | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> ProjectUpdate:
        if self.name is None and self.config is None:
            raise ValueError("Provide at least one of: name, config")
        return self


class ProjectRecord(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: OwnerIdStr
    created_at: datetime
    updated_at: datetime


class DuplicateProjectRequest(APIModel):
    name: ProjectName | None = None


class TemplateDefinition(APIModel):
    # Frozen => hashable and safe to share in the module-level registry.
    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str
    tone: str = Field(min_length=1, max_length=40)
    supports_dark_mode: bool
    supports_3d_motion: bool


class HealthResponse(APIModel):
    status: Literal["ok"]
    storage: Literal["memory", "mongodb"]
    environment: str


class UploadResponse(APIModel):
    url: str
    filename: str
    content_type: str
    size: int = Field(ge=0)


class OwnerId(APIModel):
    value: OwnerIdStr
