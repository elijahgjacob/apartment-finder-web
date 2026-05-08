"""Parallel Monitor lifecycle.

Owns one event_stream monitor: creates it on first startup, persists the id,
polls events on a short cadence and saves new matches as listings (annotated
with `details.via_monitor = True` so the UI can badge them).

Polling vs. webhooks: the demo has no public webhook URL, so we pull events
via GET /v1/monitors/{id}/events. The monitor_events table dedups by
event_id across restarts.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from .config import (
    CITY_SHORT, DEFAULT_BUDGET, SEARCH_BEDROOMS, LISTING_SITES,
    MONITOR_FREQUENCY, MONITOR_PROCESSOR, MONITOR_INCLUDE_BACKFILL,
)
from .db import get_db
from .parallel_client import ParallelClient


_STATE_FILE = Path(__file__).resolve().parent.parent / "data" / "monitor_state.json"


# Each detected change comes back as a JSON object matching this schema —
# the UI renders it directly with no downstream Task call.
_MONITOR_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "listing_url": {
            "type": "string",
            "description": "Direct URL to the apartment listing page.",
        },
        "title": {
            "type": "string",
            "description": "Short title for the listing (e.g. '3BR in Mission').",
        },
        "address": {
            "type": "string",
            "description": "Street address of the unit.",
        },
        "neighborhood": {
            "type": "string",
            "description": "Neighborhood name within the city.",
        },
        "price": {
            "type": "integer",
            "description": "Monthly rent in USD.",
        },
        "bedrooms": {
            "type": "integer",
            "description": "Number of bedrooms.",
        },
        "bathrooms": {
            "type": "number",
            "description": "Number of bathrooms.",
        },
        "summary": {
            "type": "string",
            "description": "One-sentence reason this listing is a new match.",
        },
    },
    "required": ["title", "summary"],
    "additionalProperties": False,
}


def _build_query() -> str:
    beds = SEARCH_BEDROOMS or "3"
    return (
        f"New {beds}-bedroom apartment listings for rent in {CITY_SHORT} "
        f"under ${DEFAULT_BUDGET} per month, posted on major rental aggregator "
        f"sites (Zillow, Apartments.com, Redfin, Trulia, Craigslist, HotPads, Rent.com)."
    )


# ── State persistence ───────────────────────────────────────────────────

def _load_state() -> dict | None:
    if not _STATE_FILE.exists():
        return None
    try:
        return json.loads(_STATE_FILE.read_text())
    except (OSError, ValueError):
        return None


def _save_state(state: dict) -> None:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _STATE_FILE.write_text(json.dumps(state, indent=2))


def _ensure_event_table() -> None:
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


def _event_seen(event_id: str) -> bool:
    db = get_db()
    return db.execute(
        "SELECT 1 FROM monitor_events WHERE event_id = ?", (event_id,)
    ).fetchone() is not None


def _record_event(
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


# ── Lifecycle ───────────────────────────────────────────────────────────

async def replace_monitor(client: ParallelClient, query: str) -> dict:
    """Stop the current monitor (if any) and create a new one with the
    given query. Returns the new monitor record."""
    state = _load_state() or {}
    old_id = state.get("monitor_id")
    if old_id:
        try:
            await client.monitor_delete(old_id)
            print(f"[monitor] deleted old monitor {old_id}")
        except httpx.HTTPError as e:
            print(f"[monitor] delete of {old_id} failed (non-fatal): {e}")

    body = {
        "type": "event_stream",
        "frequency": MONITOR_FREQUENCY,
        "processor": MONITOR_PROCESSOR,
        "settings": {
            "query": query.strip(),
            "output_schema": {"type": "json", "json_schema": _MONITOR_OUTPUT_SCHEMA},
            "include_backfill": MONITOR_INCLUDE_BACKFILL,
        },
        "metadata": {"app": "apt-finder", "city": CITY_SHORT[:16]},
    }
    mon = await client.monitor_create(body)
    _save_state({
        "monitor_id": mon["monitor_id"],
        "query": query.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    print(f"[monitor] created replacement monitor {mon['monitor_id']}")
    return mon


async def delete_monitor(client: ParallelClient) -> bool:
    """Delete the monitor on Parallel's side and clear local state.
    Returns True if a monitor was deleted, False if there wasn't one."""
    state = _load_state() or {}
    monitor_id = state.get("monitor_id")
    if not monitor_id:
        return False
    try:
        await client.monitor_delete(monitor_id)
    except httpx.HTTPError as e:
        print(f"[monitor] delete of {monitor_id} failed: {e}")
    if _STATE_FILE.exists():
        _STATE_FILE.unlink()
    print(f"[monitor] cleared monitor {monitor_id}")
    return True


async def ensure_monitor(client: ParallelClient) -> dict:
    """Return the active monitor — create one if we don't have it persisted.
    Verifies a persisted id by GET'ing it; recreates on 404."""
    _ensure_event_table()
    state = _load_state()
    if state and state.get("monitor_id"):
        try:
            return await client.monitor_get(state["monitor_id"])
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                raise
            print(f"[monitor] persisted monitor {state['monitor_id']} not found, recreating")

    body = {
        "type": "event_stream",
        "frequency": MONITOR_FREQUENCY,
        "processor": MONITOR_PROCESSOR,
        "settings": {
            "query": _build_query(),
            "output_schema": {"type": "json", "json_schema": _MONITOR_OUTPUT_SCHEMA},
            "include_backfill": MONITOR_INCLUDE_BACKFILL,
        },
        "metadata": {"app": "apt-finder", "city": CITY_SHORT[:16]},
    }
    mon = await client.monitor_create(body)
    _save_state({
        "monitor_id": mon["monitor_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    print(f"[monitor] created monitor {mon['monitor_id']} (frequency={MONITOR_FREQUENCY}, processor={MONITOR_PROCESSOR})")
    return mon


# ── Event → Listing ─────────────────────────────────────────────────────

def _detect_source(url: str) -> str:
    for site in LISTING_SITES.split(","):
        domain = site.strip()
        if domain and domain in url:
            return domain.split(".")[0]
    return "monitor"


def _event_to_listing(event: dict) -> dict | None:
    output = event.get("output") or {}
    content = output.get("content")
    if not content:
        return None

    if isinstance(content, str):
        try:
            content = json.loads(content)
        except (TypeError, ValueError):
            return None
    if not isinstance(content, dict):
        return None

    url = (content.get("listing_url") or "").strip()
    if not url:
        for b in (output.get("basis") or []):
            for c in (b.get("citations") or []):
                if c.get("url"):
                    url = c["url"]
                    break
            if url:
                break
    if not url:
        return None

    # Reject aggregator search-result pages.
    if re.search(r"/(apartments|rentals)(/?$|\?|/\d+\-bedrooms)", url, re.IGNORECASE):
        return None

    title = (content.get("title") or "").strip()
    address = (content.get("address") or "").strip()
    summary = (content.get("summary") or "").strip()
    price = content.get("price")
    beds = content.get("bedrooms")
    baths = content.get("bathrooms")
    neighborhood = content.get("neighborhood")

    if isinstance(price, str):
        m = re.search(r"\d+", price.replace(",", ""))
        price = int(m.group(0)) if m else None
    if isinstance(beds, str):
        m = re.search(r"\d+", beds)
        beds = int(m.group(0)) if m else None

    return {
        "title": title or summary[:80] or url,
        "url": url,
        "price": price if isinstance(price, int) and 500 <= price <= 50000 else None,
        "bedrooms": beds if isinstance(beds, int) and 0 <= beds <= 10 else None,
        "bathrooms": float(baths) if isinstance(baths, (int, float)) else None,
        "address": address or None,
        "neighborhood": neighborhood or None,
        "source": _detect_source(url),
        "body": summary,
        "details": {
            "via_monitor": True,
            "monitor_event_date": event.get("event_date"),
            "monitor_summary": summary,
        },
        "spam_score": 0,
        "spam_flags": [],
    }


# ── Poll loop entry points ──────────────────────────────────────────────

async def poll_once(client: ParallelClient, monitor_id: str) -> list[dict]:
    """Fetch latest events; save any new ones as listings. Returns saved."""
    from .tasks import _save_listing

    try:
        resp = await client.monitor_events(monitor_id)
    except httpx.HTTPError as e:
        print(f"[monitor] events fetch failed: {e}")
        return []

    events = resp.get("events") or []
    if not events:
        return []

    saved: list[dict] = []
    for ev in events:
        event_id = ev.get("event_id")
        if not event_id or _event_seen(event_id):
            continue

        listing = _event_to_listing(ev)
        if not listing:
            _record_event(event_id, ev.get("event_group_id"), ev.get("event_date"), None)
            continue

        listing_id = _save_listing(listing)
        _record_event(event_id, ev.get("event_group_id"), ev.get("event_date"), listing_id)
        if listing_id:
            listing["id"] = listing_id
            saved.append(listing)

    if saved:
        print(f"[monitor] +{len(saved)} new listings from {len(events)} events")
    return saved


async def get_status(client: ParallelClient | None = None) -> dict:
    """Return monitor info for /api/monitor."""
    state = _load_state() or {}
    monitor_id = state.get("monitor_id")
    out: dict[str, Any] = {
        "active": bool(monitor_id),
        "monitor_id": monitor_id,
        "frequency": MONITOR_FREQUENCY,
        "processor": MONITOR_PROCESSOR,
        "query": _build_query(),
    }
    if not monitor_id:
        return out
    if client:
        try:
            mon = await client.monitor_get(monitor_id)
            out["status"] = mon.get("status")
            out["last_run_at"] = mon.get("last_run_at")
            out["created_at"] = mon.get("created_at")
        except httpx.HTTPError as e:
            out["error"] = str(e)
    db = get_db()
    row = db.execute(
        "SELECT COUNT(*) AS c FROM monitor_events WHERE seen_at >= datetime('now', '-1 day')"
    ).fetchone()
    out["events_last_24h"] = row["c"] if row else 0
    return out
