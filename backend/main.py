"""Uvicorn-compatible entry point.

Run from this directory with:

    uvicorn main:app --reload --port 8000
"""

from app.main import app

__all__ = ["app"]
