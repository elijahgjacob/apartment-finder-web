import sqlite3
import os
from pathlib import Path

DB_PATH = os.environ.get("SQLITE_PATH", str(Path(__file__).resolve().parent.parent.parent / "data" / "listings.db"))

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
            phone         TEXT,
            body          TEXT,
            details       TEXT NOT NULL DEFAULT '{}',
            listed_at     TEXT NOT NULL DEFAULT (datetime('now')),
            fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
            is_active     INTEGER NOT NULL DEFAULT 1
        );
    """)

    cols = {row[1] for row in conn.execute("PRAGMA table_info(listings)").fetchall()}
    if "details" not in cols:
        conn.execute("ALTER TABLE listings ADD COLUMN details TEXT NOT NULL DEFAULT '{}'")
        conn.commit()
    if "match_basis" not in cols:
        conn.execute("ALTER TABLE listings ADD COLUMN match_basis TEXT NOT NULL DEFAULT '[]'")
        conn.commit()
    if "citations" not in cols:
        conn.execute("ALTER TABLE listings ADD COLUMN citations TEXT NOT NULL DEFAULT '[]'")
        conn.commit()

    _connection = conn
    return conn
