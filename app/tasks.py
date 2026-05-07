from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import AsyncIterator

import httpx

from .config import CITY, CITY_SHORT, LISTING_SITES
from .db import get_db
from .parallel_client import ParallelClient


# ── Task / SSE plumbing ──────────────────────────────────────────────────

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


def _extract_min_beds(query: str) -> int | None:
    m = re.search(r"(\d+)\s*(?:br|bed|bedroom)", query, re.IGNORECASE)
    return int(m.group(1)) if m else None


@dataclass
class Task:
    id: str
    query: str
    budget: int
    min_beds: int | None = None
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    events: list[dict] = field(default_factory=list)
    _subscribers: list[asyncio.Queue] = field(default_factory=list, repr=False)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        for past in self.events:
            q.put_nowait(past)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers = [s for s in self._subscribers if s is not q]

    def _push(self, event: dict) -> None:
        self.events.append(event)
        for q in self._subscribers:
            q.put_nowait(event)


_tasks: dict[str, Task] = {}


def get_task(task_id: str) -> Task | None:
    return _tasks.get(task_id)


def create_task(query: str, budget: int, min_beds: int | None = None) -> Task:
    if min_beds is None:
        min_beds = _extract_min_beds(query)
    task = Task(id=str(uuid.uuid4()), query=query, budget=budget, min_beds=min_beds)
    _tasks[task.id] = task
    return task


# ── Helpers ──────────────────────────────────────────────────────────────

def _detect_source(url: str) -> str:
    for site in LISTING_SITES.split(","):
        domain = site.strip()
        if domain in url:
            return domain.split(".")[0]
    return "web"


def _parse_int(s: str | None) -> int | None:
    if not s:
        return None
    m = re.search(r"[\d,]+", s.replace("$", ""))
    if not m:
        return None
    try:
        return int(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _clean_extracted_address(raw: str) -> str:
    cleaned = re.sub(r",?\s*\$[\d,.]+/?(?:mo|month)?$", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r",?\s*\$[\d,.]+\s*$", "", cleaned)
    return cleaned.strip().rstrip(",").strip()


def _extract_address(name: str, description: str) -> str | None:
    address_patterns = [
        r"located at\s+(.+?)(?:\.\s|\.\s*$|,\s*offers|,\s*is\s)",
        r"(\d+\s+[\w.]+(?:\s+[\w.]+)?\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Ln|Lane|Pl|Place|Ct|Court)[\w.,\s]*?)(?:\.\s|\sis\s|,\s*(?:an|a|offers|is|has|which|in the))",
    ]
    for pat in address_patterns:
        m = re.search(pat, description, re.IGNORECASE)
        if m:
            return _clean_extracted_address(m.group(1))

    if re.search(r"\d+\s+\w+\s+(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Ct)", name):
        return _clean_extracted_address(name)

    return None


def _extract_from_description(desc: str) -> dict:
    result: dict = {}

    m = re.search(r"(\d+(?:\.\d+)?)\s*-?\s*bath", desc, re.IGNORECASE)
    if m:
        result["bathrooms"] = float(m.group(1))

    m = re.search(r"([\d,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)", desc, re.IGNORECASE)
    if m:
        result["sqft"] = int(m.group(1).replace(",", ""))

    m = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", desc)
    if m:
        result["phone"] = m.group(0)

    if re.search(r"parking|garage", desc, re.IGNORECASE):
        result["has_parking"] = True
    if re.search(r"laundry|washer|dryer", desc, re.IGNORECASE):
        result["has_laundry"] = True

    return result


def _normalize_address(addr: str) -> str:
    s = addr.lower().strip()
    s = re.sub(r"\s*(apt|unit|suite|ste|#)\s*[\w-]+", "", s, flags=re.IGNORECASE)
    s = re.sub(r",?\s*(san francisco|sf|ca|california|\d{5}).*$", "", s, flags=re.IGNORECASE)
    return s.strip().rstrip(",").strip()


def _save_listing(listing_data: dict) -> str | None:
    db = get_db()

    addr = (listing_data.get("address") or "").strip()
    if addr:
        norm = _normalize_address(addr)
        if norm and len(norm) > 3:
            rows = db.execute(
                "SELECT id, address FROM listings WHERE is_active = 1"
            ).fetchall()
            for row in rows:
                if _normalize_address(row["address"] or "") == norm:
                    return None

    listing_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Note: do not geocode here. geocode_address contains a blocking
    # time.sleep that would stall the event loop. Backfill runs after
    # each search via _backfill_geocodes() under asyncio.to_thread.
    lat = listing_data.get("lat")
    lng = listing_data.get("lng")

    db.execute(
        """INSERT OR REPLACE INTO listings
           (id, source, title, url, price, bedrooms, bathrooms, sqft,
            address, neighborhood, lat, lng, has_parking, has_laundry,
            spam_score, spam_flags, phone, body, listed_at, fetched_at, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            listing_id,
            listing_data.get("source", "web"),
            listing_data.get("title"),
            listing_data.get("url"),
            listing_data.get("price"),
            listing_data.get("bedrooms"),
            listing_data.get("bathrooms"),
            listing_data.get("sqft"),
            listing_data.get("address"),
            listing_data.get("neighborhood"),
            lat,
            lng,
            1 if listing_data.get("has_parking") else 0,
            1 if listing_data.get("has_laundry") else 0,
            listing_data.get("spam_score", 0),
            json.dumps(listing_data.get("spam_flags") or []),
            listing_data.get("phone"),
            listing_data.get("body"),
            now,
            now,
            1,
        ),
    )
    db.commit()
    return listing_id


def _candidate_to_listing(candidate: dict) -> dict | None:
    """Convert a findall matched candidate to a listing dict."""
    name = candidate.get("name", "")
    url = candidate.get("url", "")
    description = candidate.get("description", "")
    output = candidate.get("output") or {}

    if not url:
        return None

    search_page_patterns = [
        r"/apartments/$",
        r"/apartments-\d+-bedrooms/$",
        r"/apartments-under-\d+/$",
        r"/\d+-bedroom-apartments",
        r"/rentals$",
        r"apartments/san-francisco",
    ]
    for pat in search_page_patterns:
        if re.search(pat, url, re.IGNORECASE):
            return None

    price = None
    beds = None
    for key, obj in output.items():
        val = obj.get("value", "")
        if not val:
            continue
        if "rent" in key or "price" in key or "cost" in key or "amount" in key:
            price = _parse_int(val)
        if "bedroom" in key or "bed" in key:
            beds = _parse_int(val)

    if price is not None and (price < 500 or price > 50000):
        price = None
    if beds is not None and (beds < 0 or beds > 10):
        beds = None

    address = _extract_address(name, description)
    if not address:
        address = name

    if not address or len(address) < 5:
        return None

    junk_patterns = [
        r"^(san francisco|sf|ca|california)(\s|,|$)",
        r"^[A-Z]{2}\s+\d{5}",
        r"^\$[\d,.]+",
        r"^\d{1,3}$",
        r"apartments?\s+for\s+rent",
        r"bedroom\s+apartments?\s+in",
        r"rentals?\s+in\s+",
        r"housing\s+in\s+",
    ]
    for pat in junk_patterns:
        if re.search(pat, address.strip(), re.IGNORECASE):
            return None

    has_street_number = bool(re.search(r"\d+\s+\w+", address))
    is_named_building = bool(re.search(
        r"(apartments?|towers?|plaza|square|heights|village|terrace|residences|lofts|place)",
        name, re.IGNORECASE
    ))
    if not has_street_number and not is_named_building:
        return None

    def _enrichment_val(key: str) -> str | None:
        obj = output.get(key)
        if obj and obj.get("type") == "enrichment":
            v = obj.get("value", "")
            return v if v and v != "N/A" and v != "NA" else None
        return None

    phone = _enrichment_val("contact_phone")
    email = _enrichment_val("contact_email")  # noqa: F841 — kept for future use

    extras = _extract_from_description(description)
    if not phone:
        phone = extras.get("phone")

    return {
        "title": name,
        "address": address,
        "neighborhood": None,
        "price": price,
        "bedrooms": beds,
        "bathrooms": extras.get("bathrooms"),
        "sqft": extras.get("sqft"),
        "lat": None,
        "lng": None,
        "source": _detect_source(url),
        "url": url,
        "has_parking": extras.get("has_parking", False),
        "has_laundry": extras.get("has_laundry", False),
        "spam_score": 0,
        "spam_flags": [],
        "phone": phone,
        "body": description,
    }


# ── Spam scoring via Task API ────────────────────────────────────────────

_SPAM_SCHEMA = {
    "type": "object",
    "properties": {
        "is_likely_spam": {"type": "boolean"},
        "spam_confidence": {"type": "number", "description": "0.0–1.0"},
        "fraud_signals": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": "string"},
    },
    "required": ["is_likely_spam", "spam_confidence", "fraud_signals"],
    "additionalProperties": False,
}

# Sources we trust enough to skip spam scoring on.
_TRUSTED_SOURCES = {"apartments", "zillow", "redfin", "realtor", "trulia", "rent", "hotpads"}


async def _score_spam(client: ParallelClient, listing: dict, timeout: float = 90.0) -> tuple[int, list[str]]:
    """Run a Task-API enrichment to classify the listing. Returns (score, flags)."""
    try:
        run = await client.task_create(
            input_data={
                "title": listing.get("title") or "",
                "body": (listing.get("body") or "")[:4000],
                "price": listing.get("price"),
                "address": listing.get("address"),
                "source": listing.get("source"),
            },
            output_schema=_SPAM_SCHEMA,
            processor="base",
        )
        run_id = run.get("run_id")
        if not run_id:
            return 0, ["task_create_no_id"]

        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(4)
            try:
                status = await client.task_status(run_id)
            except httpx.HTTPError:
                continue
            s = status.get("status", "")
            if isinstance(s, dict):
                s = s.get("status", "")
            if s in ("completed", "succeeded"):
                break
            if s in ("failed", "error", "cancelled"):
                return 0, [f"task_{s}"]

        result = await client.task_result(run_id)
        content = ((result.get("output") or {}).get("content")) or {}
        confidence = float(content.get("spam_confidence") or 0)
        score = max(0, min(100, int(confidence * 100)))
        flags = content.get("fraud_signals") or []
        return score, flags
    except (httpx.HTTPError, asyncio.TimeoutError) as e:
        return 0, [f"task_api_error:{type(e).__name__}"]


async def _score_listings_concurrently(
    client: ParallelClient, listings: list[dict], concurrency: int = 5
) -> None:
    """Spam-score each listing in place. Skips trusted sources."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(l: dict) -> None:
        if l.get("source") in _TRUSTED_SOURCES:
            return
        async with sem:
            score, flags = await _score_spam(client, l)
            l["spam_score"] = score
            l["spam_flags"] = flags

    await asyncio.gather(*(_one(l) for l in listings))


# ── FindAll match conditions ─────────────────────────────────────────────

def _match_conditions(min_beds: int | None, budget: int) -> list[dict]:
    conds = [
        {"name": "is_individual_listing",
         "description": "The page must be a single-property listing, not a search results / category index page."},
        {"name": "in_target_city",
         "description": f"The property must be located in {CITY_SHORT}."},
        {"name": "under_budget",
         "description": f"The asking monthly rent must be at most {budget} US dollars."},
    ]
    if min_beds:
        conds.append({
            "name": "matches_bedroom_count",
            "description": f"The unit must have at least {min_beds} bedrooms (not studio, not fewer).",
        })
    return conds


# ── Main task runner ─────────────────────────────────────────────────────

async def run_task(task: Task) -> None:
    task.status = TaskStatus.RUNNING
    task._push({"event": "status", "status": "running"})

    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        task.status = TaskStatus.ERROR
        task._push({"event": "error", "message": "PARALLEL_API_KEY is not set — add it to .env"})
        return

    beds_str = f"{task.min_beds} bedroom " if task.min_beds else ""
    objective = (
        f"Find {beds_str}apartments for rent "
        f"under {task.budget} dollars per month "
        f"in {CITY_SHORT}"
    )
    if task.query and CITY_SHORT.lower() not in task.query.lower():
        objective += f". {task.query}"

    try:
        async with ParallelClient(api_key=api_key) as client:
            task._push({"event": "reasoning", "text": f"Objective: {objective}\n"})
            task._push({"event": "reasoning", "text": f"Budget: ${task.budget:,}/mo"})
            if task.min_beds:
                task._push({"event": "reasoning", "text": f" · {task.min_beds}+ beds"})
            task._push({"event": "reasoning", "text": "\n\nStarting entity discovery…\n"})

            run_data = await client.findall_create(
                objective=objective,
                entity_type="apartment rental listings",
                match_conditions=_match_conditions(task.min_beds, task.budget),
                enrichments=[
                    {"name": "contact_phone",
                     "description": "Phone number to contact about renting this apartment."},
                    {"name": "contact_email",
                     "description": "Email address to contact about renting this apartment."},
                ],
                generator="core",
                match_limit=25,
            )
            findall_id = run_data.get("findall_id") or run_data.get("run_id")
            if not findall_id:
                task.status = TaskStatus.ERROR
                task._push({"event": "error", "message": "FindAll create returned no id"})
                return
            task._push({"event": "reasoning", "text": f"Run: {findall_id}\n"})
            task._push({"event": "reasoning", "text": "Searching and verifying candidates…\n\n"})

            prev_generated = 0
            prev_matched = 0
            for _ in range(120):  # up to 16 min with 8s interval
                await asyncio.sleep(8)
                task._push({"event": "ping", "ts": datetime.now(timezone.utc).isoformat()})

                try:
                    status_resp = await client.findall_status(findall_id)
                except httpx.HTTPError:
                    continue

                status_obj = status_resp.get("status")
                if isinstance(status_obj, dict):
                    state = status_obj.get("status", "")
                    metrics = status_obj.get("metrics", {})
                else:
                    state = status_obj or ""
                    metrics = status_resp.get("metrics", {})
                generated = metrics.get("generated_candidates_count", 0)
                matched = metrics.get("matched_candidates_count", 0)

                if generated != prev_generated or matched != prev_matched:
                    task._push({"event": "reasoning",
                                "text": f"Progress: {generated} candidates, {matched} verified\n"})
                    prev_generated = generated
                    prev_matched = matched

                if state == "completed":
                    task._push({"event": "reasoning",
                                "text": f"\nDiscovery done: {matched} verified.\n"})
                    break

            result_data = await client.findall_result(findall_id)
            matched_candidates = [
                c for c in (result_data.get("candidates") or [])
                if c.get("match_status") == "matched"
            ]
            task._push({"event": "reasoning",
                        "text": f"Parsing {len(matched_candidates)} matches…\n"})

            listings: list[dict] = []
            for c in matched_candidates:
                l = _candidate_to_listing(c)
                if l:
                    listings.append(l)

            if listings:
                task._push({"event": "reasoning",
                            "text": f"Spam-scoring {len([l for l in listings if l['source'] not in _TRUSTED_SOURCES])} untrusted-source listings…\n"})
                await _score_listings_concurrently(client, listings, concurrency=5)

            saved = 0
            for l in listings:
                listing_id = _save_listing(l)
                if listing_id is None:
                    continue
                l["id"] = listing_id
                saved += 1

                price_str = f"${l['price']:,}/mo" if l.get("price") else "—"
                addr_str = l.get("address") or "—"
                bd = f"{l['bedrooms']}bd" if l.get("bedrooms") else "?bd"
                spam = f" · spam:{l['spam_score']}" if l.get("spam_score", 0) > 0 else ""
                task._push({"event": "reasoning",
                            "text": f"  + {addr_str} — {bd} — {price_str}{spam}\n"})
                task._push({"event": "listing", "listing": l})

            task._push({"event": "reasoning", "text": f"\nDone. {saved} listings saved.\n"})
            task.status = TaskStatus.DONE
            task._push({"event": "status", "status": "done"})

    except httpx.HTTPStatusError as e:
        task.status = TaskStatus.ERROR
        task._push({"event": "error",
                    "message": f"Parallel API {e.response.status_code}: {e.response.text[:200]}"})
    except Exception as e:
        task.status = TaskStatus.ERROR
        task._push({"event": "error", "message": str(e)})


# ── SSE ──────────────────────────────────────────────────────────────────

async def stream_task(task: Task) -> AsyncIterator[str]:
    q = task.subscribe()
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=120)
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
                continue

            yield f"event: {event['event']}\ndata: {json.dumps(event)}\n\n"

            if event["event"] in ("done", "error"):
                break
    finally:
        task.unsubscribe(q)
