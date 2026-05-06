import sqlite3
import os
from pathlib import Path

DB_PATH = os.environ.get("SQLITE_PATH", str(Path(__file__).resolve().parent.parent / "data" / "listings.db"))

_connection: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _connection
    if _connection is not None:
        return _connection

    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS listings (
            id            TEXT PRIMARY KEY,
            source        TEXT NOT NULL DEFAULT '',
            title         TEXT,
            url           TEXT,
            price         INTEGER,
            bedrooms      INTEGER,
            bathrooms     REAL,
            sqft          INTEGER,
            address       TEXT,
            neighborhood  TEXT,
            lat           REAL,
            lng           REAL,
            has_parking   INTEGER,
            has_laundry   INTEGER,
            spam_score    INTEGER NOT NULL DEFAULT 0,
            spam_flags    TEXT NOT NULL DEFAULT '[]',
            body          TEXT,
            listed_at     TEXT NOT NULL DEFAULT (datetime('now')),
            fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
            is_active     INTEGER NOT NULL DEFAULT 1
        );
    """)

    _connection = conn
    return conn
