"""Minimal in-memory rate limiter, shared by login, password-reset, and
registration.

Per-process/in-memory by design: Render's free tier runs a single instance,
so a dict is enough here and avoids adding Redis for a demo-scale app. State
resets on restart/cold-sleep, which is an acceptable tradeoff at this scale.
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, status

WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS = 5

_attempts: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _prune(key: str, now: float) -> list[float]:
    recent = [t for t in _attempts[key] if now - t < WINDOW_SECONDS]
    _attempts[key] = recent
    return recent


def enforce_rate_limit(key: str) -> None:
    now = time.time()
    with _lock:
        recent = _prune(key, now)
        if len(recent) >= MAX_ATTEMPTS:
            retry_minutes = max(1, int((WINDOW_SECONDS - (now - recent[0])) / 60) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in about {retry_minutes} minute(s).",
            )


def record_attempt(key: str) -> None:
    with _lock:
        _attempts[key].append(time.time())


def reset_attempts(key: str) -> None:
    with _lock:
        _attempts.pop(key, None)
