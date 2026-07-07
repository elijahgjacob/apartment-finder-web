from __future__ import annotations

import json
from pathlib import Path

from .database import get_db

_STATE_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "monitor_state.json"


def load_state() -> dict | None:
    if not _STATE_FILE.exists():
        return None
    try:
        return json.loads(_STATE_FILE.read_text())
    except (OSError, ValueError):
        return None


def save_state(state: dict) -> None:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _STATE_FILE.write_text(json.dumps(state, indent=2))


def delete_state_file() -> None:
    if _STATE_FILE.exists():
        _STATE_FILE.unlink()


def ensure_event_table() -> None:
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS monitor_events (
            event_id        TEXT PRIMARY KEY,
            event_group_id  TEXT,
            event_date      TEXT,
            seen_at         TEXT NOT NULL DEFAULT (datetime('now')),
            listing_id      TEXT
        );
    """)


def event_seen(event_id: str) -> bool:
    db = get_db()
    return db.execute(
        "SELECT 1 FROM monitor_events WHERE event_id = ?", (event_id,)
    ).fetchone() is not None


def record_event(
    event_id: str,
    event_group_id: str | None,
    event_date: str | None,
    listing_id: str | None,
) -> None:
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO monitor_events "
        "(event_id, event_group_id, event_date, listing_id) "
        "VALUES (?, ?, ?, ?)",
        (event_id, event_group_id, event_date, listing_id),
    )
    db.commit()


def get_recent_event_count() -> int:
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) AS c FROM monitor_events WHERE seen_at >= datetime('now', '-1 day')"
    ).fetchone()
    return row["c"] if row else 0
