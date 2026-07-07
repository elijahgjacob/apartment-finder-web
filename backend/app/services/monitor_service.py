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
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("apt-finder.monitor")

from ..config import (
    BLOCKED_DOMAINS,
    CITY_SHORT, DEFAULT_BUDGET, SEARCH_BEDROOMS, LISTING_SITES,
    MONITOR_FREQUENCY, MONITOR_PROCESSOR, MONITOR_INCLUDE_BACKFILL,
)
from ..repositories.listing_repository import save_listing
from ..repositories.monitor_repository import (
    load_state, save_state, delete_state_file,
    ensure_event_table, event_seen, record_event,
    get_recent_event_count,
)
from .parallel_client import ParallelClient


_MONITOR_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "listing_url": {
            "type": "string",
            "description": "Direct URL to the apartment listing page.",
        },
        "title": {
            "type": "string",
            "description": "Short title for the listing (e.g. '3BR near downtown').",
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
    excluded = ""
    if BLOCKED_DOMAINS:
        excluded = (
            f" Exclude any results from these domains: {', '.join(BLOCKED_DOMAINS)}. "
            f"Prefer the original landlord, broker, or property-management website."
        )
    return (
        f"New {beds}-bedroom apartment listings for rent in {CITY_SHORT} "
        f"under ${DEFAULT_BUDGET} per month, posted on major rental aggregator "
        f"sites (Redfin, Trulia, Craigslist, HotPads, Rent.com, Compass, Realtor.com)."
        + excluded
    )


# ── Lifecycle ───────────────────────────────────────────────────────────

async def replace_monitor(client: ParallelClient, query: str) -> dict:
    """Stop the current monitor (if any) and create a new one with the
    given query. Returns the new monitor record."""
    state = load_state() or {}
    old_id = state.get("monitor_id")
    if old_id:
        try:
            await client.monitor_delete(old_id)
            logger.info("Deleted old monitor %s", old_id)
        except httpx.HTTPError as e:
            logger.warning("Delete of monitor %s failed (non-fatal): %s", old_id, e)

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
    save_state({
        "monitor_id": mon["monitor_id"],
        "query": query.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Created replacement monitor %s", mon["monitor_id"])
    return mon


async def delete_monitor(client: ParallelClient) -> bool:
    """Delete the monitor on Parallel's side and clear local state.
    Returns True if a monitor was deleted, False if there wasn't one."""
    state = load_state() or {}
    monitor_id = state.get("monitor_id")
    if not monitor_id:
        return False
    try:
        await client.monitor_delete(monitor_id)
    except httpx.HTTPError as e:
        logger.warning("Delete of monitor %s failed: %s", monitor_id, e)
    delete_state_file()
    logger.info("Cleared monitor %s", monitor_id)
    return True


async def ensure_monitor(client: ParallelClient) -> dict:
    """Return the active monitor — create one if we don't have it persisted.
    Verifies a persisted id by GET'ing it; recreates on 404."""
    ensure_event_table()
    state = load_state()
    if state and state.get("monitor_id"):
        try:
            return await client.monitor_get(state["monitor_id"])
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                raise
            logger.info("Persisted monitor %s not found, recreating", state["monitor_id"])

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
    save_state({
        "monitor_id": mon["monitor_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Created monitor %s (frequency=%s, processor=%s)", mon["monitor_id"], MONITOR_FREQUENCY, MONITOR_PROCESSOR)
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

    if re.search(r"/(apartments|rentals)(/?$|\?|/\d+\-bedrooms)", url, re.IGNORECASE):
        return None

    u = url.lower()
    if any(d in u for d in BLOCKED_DOMAINS):
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
            "search_city": CITY_SHORT,
        },
        "spam_score": 0,
        "spam_flags": [],
    }


# ── Poll loop entry points ──────────────────────────────────────────────

async def poll_once(client: ParallelClient, monitor_id: str) -> list[dict]:
    """Fetch latest events; save any new ones as listings. Returns saved."""
    try:
        resp = await client.monitor_events(monitor_id)
    except httpx.HTTPError as e:
        logger.warning("Monitor events fetch failed: %s", e)
        return []

    events = resp.get("events") or []
    if not events:
        return []

    saved: list[dict] = []
    for ev in events:
        event_id = ev.get("event_id")
        if not event_id or event_seen(event_id):
            continue

        listing = _event_to_listing(ev)
        if not listing:
            record_event(event_id, ev.get("event_group_id"), ev.get("event_date"), None)
            continue

        listing_id = save_listing(listing)
        record_event(event_id, ev.get("event_group_id"), ev.get("event_date"), listing_id)
        if listing_id:
            listing["id"] = listing_id
            saved.append(listing)

    if saved:
        logger.info("+%d new listings from %d events", len(saved), len(events))
    return saved


async def get_status(client: ParallelClient | None = None) -> dict:
    """Return monitor info for /api/monitor."""
    state = load_state() or {}
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
    out["events_last_24h"] = get_recent_event_count()
    return out
