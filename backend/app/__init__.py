"""FolioForge backend application package.

Provides package metadata, library-safe logging, and lazy access to the
application factory so that ``import app`` stays fast and free of side effects.
"""

from __future__ import annotations

import logging
import os
from importlib import import_module
from importlib.metadata import PackageNotFoundError, version as _dist_version
from typing import TYPE_CHECKING, Any, Final

if TYPE_CHECKING:  # pragma: no cover - type-checkers only
    from .main import create_app as create_app

__all__ = ["__version__", "PACKAGE_NAME", "create_app", "configure_logging"]

PACKAGE_NAME: Final[str] = "folioforge-backend"

try:
    __version__: str = _dist_version(PACKAGE_NAME)
except PackageNotFoundError:  # running from a source checkout
    __version__ = "0.0.0+dev"

# Library best practice: never emit logs unless the host app configures them.
logging.getLogger(__name__).addHandler(logging.NullHandler())

# Public name -> (submodule, attribute) for lazy resolution (PEP 562).
_LAZY: Final[dict[str, tuple[str, str]]] = {
    "create_app": (".main", "create_app"),
}


def configure_logging(level: int | str | None = None) -> None:
    """Configure structured console logging for the whole package.

    The level falls back to the ``FOLIOFORGE_LOG_LEVEL`` env var, then INFO.
    """
    resolved = level or os.getenv("FOLIOFORGE_LOG_LEVEL", "INFO")
    logging.basicConfig(
        level=resolved,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def __getattr__(name: str) -> Any:
    """Resolve heavy attributes on first access and cache them."""
    try:
        module_name, attr = _LAZY[name]
    except KeyError:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from None
    value = getattr(import_module(module_name, __name__), attr)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(__all__))
