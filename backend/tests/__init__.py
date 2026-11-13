from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import TYPE_CHECKING, Any

try:
    __version__ = version("app")  # set this to your real distribution name
except PackageNotFoundError:  # running from source, not installed
    __version__ = "0.0.0+local"

if TYPE_CHECKING:  # visible to type checkers and IDEs, free at runtime
    from fastapi import FastAPI

    from app.config import Settings
    from app.main import create_app

__all__ = ["Settings", "__version__", "create_app"]

# Lazy re-exports (PEP 562). Importing `app` stays cheap and cannot trigger
# circular imports or load FastAPI until create_app/Settings are actually used.
_LAZY: dict[str, tuple[str, str]] = {
    "create_app": ("app.main", "create_app"),
    "Settings": ("app.config", "Settings"),
}


def __getattr__(name: str) -> Any:
    try:
        module_name, attr = _LAZY[name]
    except KeyError:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from None

    from importlib import import_module

    value = getattr(import_module(module_name), attr)
    globals()[name] = value  # cache so __getattr__ runs only once per name
    return value


def __dir__() -> list[str]:
    return sorted([*globals(), *_LAZY])
