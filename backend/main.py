"""Uvicorn-compatible entry point.

Development:
    uvicorn main:app --reload --port 8000
    python main.py                      # reload on when APP_ENV=development

Production:
    APP_ENV=production WORKERS=4 python main.py
    gunicorn main:app -k uvicorn.workers.UvicornWorker -w 4

Environment variables:
    APP_ENV      development | production        (default: development)
    HOST         bind address                     (default: 127.0.0.1 dev, 0.0.0.0 prod)
    PORT         bind port                        (default: 8000)
    WORKERS      worker processes, prod only      (default: CPU count)
    LOG_LEVEL    debug | info | warning | error   (default: info)
    FORWARDED_ALLOW_IPS  trusted proxy IPs        (default: 127.0.0.1)
"""

from __future__ import annotations

import logging
import multiprocessing
import os
import sys
from dataclasses import dataclass

logger = logging.getLogger("entrypoint")

try:
    from app.main import app
except ImportError as exc:  # pragma: no cover
    # Surface a useful message instead of a bare traceback when run from the wrong dir
    logger.error(
        "Could not import 'app.main:app' (%s). Run from the project root "
        "(the folder containing 'app/') and check that dependencies are installed.",
        exc,
    )
    raise

__all__ = ["app"]


@dataclass(frozen=True)
class ServerSettings:
    env: str
    host: str
    port: int
    workers: int
    log_level: str
    forwarded_allow_ips: str

    @property
    def is_dev(self) -> bool:
        return self.env == "development"

    @classmethod
    def from_env(cls) -> "ServerSettings":
        env = os.getenv("APP_ENV", "development").strip().lower()
        is_dev = env == "development"
        return cls(
            env=env,
            host=os.getenv("HOST", "127.0.0.1" if is_dev else "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            workers=int(os.getenv("WORKERS", multiprocessing.cpu_count())),
            log_level=os.getenv("LOG_LEVEL", "debug" if is_dev else "info").lower(),
            forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1"),
        )


def run() -> None:
    import uvicorn

    s = ServerSettings.from_env()
    logging.basicConfig(
        level=s.log_level.upper(),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    logger.info("Starting server env=%s host=%s port=%d", s.env, s.host, s.port)

    uvicorn.run(
        "main:app",                      # import string is required for reload/workers
        host=s.host,
        port=s.port,
        reload=s.is_dev,
        workers=None if s.is_dev else s.workers,   # workers and reload are mutually exclusive
        log_level=s.log_level,
        proxy_headers=True,
        forwarded_allow_ips=s.forwarded_allow_ips,
        access_log=s.is_dev,             # skip per-request logs in prod; use your proxy's
        timeout_graceful_shutdown=15,
    )


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        sys.exit(0)
