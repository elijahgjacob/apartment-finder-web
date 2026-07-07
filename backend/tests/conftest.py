import sqlite3

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def in_memory_db(monkeypatch):
    """Provide an in-memory SQLite database and patch the repository to use it."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)
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
        CREATE TABLE IF NOT EXISTS monitor_events (
            event_id        TEXT PRIMARY KEY,
            event_group_id  TEXT,
            event_date      TEXT,
            seen_at         TEXT NOT NULL DEFAULT (datetime('now')),
            listing_id      TEXT
        );
    """)

    import app.repositories.database as db_mod
    monkeypatch.setattr(db_mod, "_connection", conn)

    yield conn
    conn.close()


@pytest.fixture()
def client(in_memory_db):
    """Test client with the in-memory DB patched in."""
    from app.main import app
    return TestClient(app, raise_server_exceptions=False)
