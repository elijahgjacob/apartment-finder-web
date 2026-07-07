"""In-memory ring buffer that records every outbound API call.

Thread-safe, no external dependencies. The frontend /docs page polls
GET /api/debug/api-calls to render a live timeline of Parallel / Nominatim
traffic.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone


MAX_ENTRIES = 200


@dataclass
class ApiCallEntry:
    timestamp: str
    api: str
    method: str
    path: str
    status_code: int | None = None
    duration_ms: float | None = None
    request_summary: str = ""
    response_summary: str = ""
    error: str | None = None


_lock = threading.Lock()
_buffer: deque[ApiCallEntry] = deque(maxlen=MAX_ENTRIES)
_stats: dict[str, int] = {"total": 0, "errors": 0}


def log_call(
    api: str,
    method: str,
    path: str,
    status_code: int | None = None,
    duration_ms: float | None = None,
    request_summary: str = "",
    response_summary: str = "",
    error: str | None = None,
) -> None:
    entry = ApiCallEntry(
        timestamp=datetime.now(timezone.utc).isoformat(),
        api=api,
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=round(duration_ms, 1) if duration_ms is not None else None,
        request_summary=request_summary[:500],
        response_summary=response_summary[:500],
        error=error,
    )
    with _lock:
        _buffer.append(entry)
        _stats["total"] += 1
        if error or (status_code and status_code >= 400):
            _stats["errors"] += 1


def get_recent_calls(limit: int = 100) -> list[dict]:
    with _lock:
        entries = list(_buffer)
    return [asdict(e) for e in entries[-limit:]]


def get_stats() -> dict:
    with _lock:
        return {**_stats, "buffer_size": len(_buffer)}
