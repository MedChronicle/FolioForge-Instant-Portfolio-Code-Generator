from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from functools import lru_cache
from types import MappingProxyType
from typing import Final, Mapping

from .schemas import TemplateDefinition

DEFAULT_TEMPLATE_ID: Final[str] = "minimal-professional"

# Immutable registry: callers can't accidentally mutate shared state.
TEMPLATES: Final[tuple[TemplateDefinition, ...]] = (
    TemplateDefinition(
        id="creative-editorial",
        name="Creative Editorial",
        description="Warm ivory surfaces, oversized type, layered imagery, and expressive scroll motion.",
        tone="warm-editorial",
        supports_dark_mode=False,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="minimal-professional",
        name="Minimal Professional",
        description="A restrained, readable portfolio for clear case studies and professional credibility.",
        tone="minimal",
        supports_dark_mode=False,
        supports_3d_motion=False,
    ),
    TemplateDefinition(
        id="dark-futuristic",
        name="Dark Futuristic",
        description="Dark surfaces, luminous accents, and a controlled technical atmosphere.",
        tone="futuristic",
        supports_dark_mode=True,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="developer-terminal",
        name="Developer Terminal",
        description="A terminal-inspired layout with strong information hierarchy and code-like details.",
        tone="terminal",
        supports_dark_mode=True,
        supports_3d_motion=False,
    ),
    TemplateDefinition(
        id="modern-glass",
        name="Modern Glass",
        description="Soft gradients, translucent panels, and a polished product-designer feel.",
        tone="glass",
        supports_dark_mode=True,
        supports_3d_motion=True,
    ),
    TemplateDefinition(
        id="playful-experimental",
        name="Playful Experimental",
        description="Colorful shapes, unexpected composition, and a more expressive motion language.",
        tone="experimental",
        supports_dark_mode=False,
        supports_3d_motion=True,
    ),
)


def _validate(templates: Iterable[TemplateDefinition]) -> None:
    """Fail fast at import time if the registry is malformed."""
    dupes = [k for k, n in Counter(t.id for t in templates).items() if n > 1]
    if dupes:
        raise ValueError(f"Duplicate template ids: {sorted(dupes)}")


_validate(TEMPLATES)

# O(1) lookup by id, read-only.
TEMPLATES_BY_ID: Final[Mapping[str, TemplateDefinition]] = MappingProxyType(
    {t.id: t for t in TEMPLATES}
)

if DEFAULT_TEMPLATE_ID not in TEMPLATES_BY_ID:
    raise ValueError(f"Default template {DEFAULT_TEMPLATE_ID!r} is not registered")


class TemplateNotFoundError(KeyError):
    """Raised when a template id is not in the registry."""


def get_template(template_id: str, *, fallback: bool = False) -> TemplateDefinition:
    """Return a template by id; optionally fall back to the default."""
    try:
        return TEMPLATES_BY_ID[template_id]
    except KeyError:
        if fallback:
            return TEMPLATES_BY_ID[DEFAULT_TEMPLATE_ID]
        available = ", ".join(sorted(TEMPLATES_BY_ID))
        raise TemplateNotFoundError(
            f"Unknown template {template_id!r}. Available: {available}"
        ) from None


@lru_cache(maxsize=64)
def _filter(
    dark_mode: bool | None, motion_3d: bool | None, tone: str | None
) -> tuple[TemplateDefinition, ...]:
    return tuple(
        t
        for t in TEMPLATES
        if (dark_mode is None or t.supports_dark_mode == dark_mode)
        and (motion_3d is None or t.supports_3d_motion == motion_3d)
        and (tone is None or t.tone == tone)
    )


def list_templates(
    *,
    dark_mode: bool | None = None,
    motion_3d: bool | None = None,
    tone: str | None = None,
) -> tuple[TemplateDefinition, ...]:
    """List templates, optionally filtered by capability or tone."""
    return _filter(dark_mode, motion_3d, tone)


def template_ids() -> tuple[str, ...]:
    return tuple(TEMPLATES_BY_ID)


__all__ = [
    "DEFAULT_TEMPLATE_ID",
    "TEMPLATES",
    "TEMPLATES_BY_ID",
    "TemplateNotFoundError",
    "get_template",
    "list_templates",
    "template_ids",
]
