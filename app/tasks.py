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

from .config import (
    BLOCKED_DOMAINS,
    CITY, CITY_SHORT,
    FINDALL_GENERATOR,
    LISTING_SITES,
    TASK_SPAM_PROCESSOR,
)
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

# Realistic monthly-rent floors by bedroom count, San Francisco-area.
# Used as a sanity check on parsed prices — anything below ~50% of these
# values is almost always a parse miscue (street number, deposit, fee).
# (Same numbers the frontend uses for the "budget too low" warning.)
_RENT_FLOORS_SF: dict[int, int] = {
    0: 1900, 1: 2700, 2: 3600, 3: 5200, 4: 6500, 5: 8000,
}


def _absolute_min_price(beds: int | None) -> int:
    """Lower bound for plausibility checks. If we don't know the bed count,
    use a global $1,500 floor (no real US rental is below this). If we do,
    use 55% of the typical rent for that bedroom count — permissive enough
    for genuine BMR units, strict enough to catch street-number miscues."""
    if beds is None:
        return 1500
    typical = _RENT_FLOORS_SF.get(beds) or _RENT_FLOORS_SF.get(min(beds, 5)) or 2000
    return int(typical * 0.55)


def _detect_source(url: str) -> str:
    for site in LISTING_SITES.split(","):
        domain = site.strip()
        if domain in url:
            return domain.split(".")[0]
    return "web"


def is_blocked_url(url: str) -> bool:
    """Reject URLs from any domain we explicitly don't want results from
    (currently zillow.com + apartments.com — see config.BLOCKED_DOMAINS)."""
    if not url:
        return False
    u = url.lower()
    return any(d in u for d in BLOCKED_DOMAINS)


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


def _address_from_name(name: str) -> str | None:
    """Last-resort fallback: only used when the API didn't return a street_address.
    Recognizes either a street-number address or a named-building pattern in the
    candidate's name field. Pure post-filter, no description-prose mining."""
    if re.search(r"\d+\s+\w+\s+(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Ct)", name):
        return _clean_extracted_address(name)
    return None


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
            spam_score, spam_flags, phone, body, details, listed_at, fetched_at, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
            json.dumps(listing_data.get("details") or {}),
            now,
            now,
            1,
        ),
    )
    db.commit()
    return listing_id


_NA_VALUES = {"", "N/A", "NA", "null", "None", "unknown", "Unknown", "-"}


def _output_val(output: dict, key: str) -> str | None:
    """Read either a match_condition value or an enrichment value by key."""
    obj = output.get(key)
    if not obj:
        return None
    v = obj.get("value")
    if v is None:
        return None
    s = str(v).strip()
    return s if s not in _NA_VALUES else None


def _output_float(output: dict, key: str) -> float | None:
    s = _output_val(output, key)
    if not s:
        return None
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def _output_bool(output: dict, key: str, true_words: tuple[str, ...] = ("yes", "true", "available", "allowed", "included")) -> bool | None:
    s = _output_val(output, key)
    if not s:
        return None
    sl = s.lower()
    if any(w in sl for w in true_words):
        return True
    if any(w in sl for w in ("no", "none", "not", "false", "unavailable", "n/a")):
        return False
    return None


def _candidate_to_listing(candidate: dict, min_beds: int | None = None) -> dict | None:
    """Convert a FindAll matched candidate to a listing dict.

    Structured fields come from the API's match_condition + enrichment
    output. Regex is used only for post-filter defense (URL / address
    sanity checks) — never to mine the description prose."""
    name = candidate.get("name", "")
    url = candidate.get("url", "")
    description = candidate.get("description", "")
    output = candidate.get("output") or {}

    if not url:
        return None

    # Hard reject: explicitly blocked domains (zillow.com / apartments.com).
    if is_blocked_url(url):
        return None

    # Post-filter: URL points at an aggregate / category page, not a unit.
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

    # Address comes first — needed for the price-vs-street-number sanity check.
    address = _output_val(output, "street_address") or _address_from_name(name) or name
    if not address or len(address) < 5:
        return None

    # Core fields — prefer the explicit enrichments, fall back to any
    # match_condition output that happens to surface a number.
    rent_str = _output_val(output, "monthly_rent_usd")
    price = _parse_int(rent_str) if rent_str else None
    if price is None:
        for key, obj in output.items():
            val = obj.get("value", "")
            if not val:
                continue
            if "rent" in key or "price" in key or "cost" in key or "amount" in key:
                price = _parse_int(val)
                if price is not None:
                    break

    beds_str = _output_val(output, "bedrooms")
    beds = _parse_int(beds_str) if beds_str else None
    if beds is None:
        for key, obj in output.items():
            val = obj.get("value", "")
            if not val:
                continue
            if "bedroom" in key or ("bed" in key and "br" in key):
                beds = _parse_int(val)
                if beds is not None:
                    break

    # Coarse plausibility bounds.
    if price is not None and (price < 500 or price > 50000):
        price = None
    if beds is not None and (beds < 0 or beds > 10):
        beds = None

    # City-aware floor by bedroom count. If the model returned a price
    # well below typical rent for this unit size, treat it as a parse
    # miscue (street number, deposit, or fee picked up as rent).
    if price is not None:
        if price < _absolute_min_price(beds):
            return None

    # Defensive: reject when the parsed price equals ANY numeric token
    # in the street address (street number, unit number, zip, etc.).
    # Catches '1475 Fillmore St / $1475' and 'Unit 808 / $808' alike.
    if price is not None:
        for n in re.findall(r"\d+", address):
            if int(n) == price:
                return None

    # Post-filter: hard reject if user asked for N+ bedrooms and the listing
    # advertises fewer. Allow None-beds through (rely on enrichment to fill).
    if min_beds and beds is not None and beds < min_beds:
        return None

    # Post-filter: address looks like a non-address blurb.
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

    bathrooms = _output_float(output, "bathrooms")
    sqft_str = _output_val(output, "square_feet")
    sqft = int(re.sub(r"\D", "", sqft_str)) if sqft_str and re.search(r"\d", sqft_str) else None
    if sqft is not None and (sqft < 100 or sqft > 10000):
        sqft = None

    parking_type = _output_val(output, "parking_type")
    laundry_type = _output_val(output, "laundry_type")
    has_parking = _output_bool(output, "parking_type", true_words=("garage", "covered", "carport", "parking", "yes", "available", "included"))
    if has_parking is None and parking_type:
        has_parking = "no" not in parking_type.lower() and "none" not in parking_type.lower()
    has_laundry = _output_bool(output, "laundry_type", true_words=("in-unit", "in unit", "washer", "dryer", "laundry", "yes", "shared"))
    if has_laundry is None and laundry_type:
        has_laundry = "no" not in laundry_type.lower() and "none" not in laundry_type.lower()

    phone = _output_val(output, "contact_phone")
    email = _output_val(output, "contact_email")

    # Freshness signals from the API
    is_active_str = _output_val(output, "is_currently_active")
    is_currently_active: bool | None = None
    if is_active_str is not None:
        sl = is_active_str.strip().lower()
        if sl in ("yes", "true", "active", "available"):
            is_currently_active = True
        elif sl in ("no", "false", "leased", "rented", "pending", "unavailable", "removed", "off-market"):
            is_currently_active = False

    days_str = _output_val(output, "days_on_market")
    days_on_market: int | None = None
    if days_str is not None:
        try:
            n = int(re.sub(r"\D", "", days_str) or "0")
            days_on_market = n if 0 <= n <= 3650 else None
        except ValueError:
            pass

    # Renter-facing details — stored as JSON, surfaced on the card.
    details = {
        "available_date": _output_val(output, "available_date"),
        "lease_term": _output_val(output, "lease_term"),
        "pet_policy": _output_val(output, "pet_policy"),
        "is_furnished": _output_bool(output, "is_furnished"),
        "utilities_included": _output_val(output, "utilities_included"),
        "amenities": _output_val(output, "building_amenities"),
        "neighborhood_name": _output_val(output, "neighborhood"),
        "contact_email": email,
        "parking_type": parking_type,
        "laundry_type": laundry_type,
        "is_currently_active": is_currently_active,
        "days_on_market": days_on_market,
    }
    # Drop empty keys so the JSON stays small.
    details = {k: v for k, v in details.items() if v not in (None, "", [], {})}

    # Per-match-condition results (e.g. "in_target_city: San Francisco, CA, US ✓")
    # Used for the demo's "why this match" panel; not persisted.
    match_basis = []
    for key, obj in output.items():
        if obj.get("type") == "match_condition":
            match_basis.append({
                "name": key,
                "value": obj.get("value", ""),
                "matched": bool(obj.get("is_matched")),
            })

    # Top-level basis from FindAll: per-field reasoning + citations.
    citations = []
    for b in (candidate.get("basis") or []):
        for c in (b.get("citations") or []):
            url_c = c.get("url") or ""
            title = c.get("title") or url_c
            if url_c:
                citations.append({"title": title[:120], "url": url_c})
    # Dedup citations
    seen_cites = set()
    unique_citations = []
    for c in citations:
        if c["url"] not in seen_cites:
            seen_cites.add(c["url"])
            unique_citations.append(c)

    return {
        "title": name,
        "address": address,
        "neighborhood": details.get("neighborhood_name"),
        "price": price,
        "bedrooms": beds,
        "bathrooms": bathrooms,
        "sqft": sqft,
        "lat": None,
        "lng": None,
        "source": _detect_source(url),
        "url": url,
        "has_parking": bool(has_parking) if has_parking is not None else False,
        "has_laundry": bool(has_laundry) if has_laundry is not None else False,
        "spam_score": 0,
        "spam_flags": [],
        "phone": phone,
        "body": description,
        "details": details,
        # Demo-only — not persisted, only shipped via SSE listing event
        "match_basis": match_basis,
        "citations": unique_citations[:5],
    }


# ── Spam scoring via Task API ────────────────────────────────────────────
#
# Per the cookbook: avoid subjective "is_likely_spam" outputs. Decompose
# into fact-based booleans the API can verify with citations, then weight
# them in code. Drop rationale/confidence — both are already returned in
# the Task API's per-field `basis` array.

_SPAM_SCHEMA = {
    "type": "object",
    "properties": {
        "demands_off_platform_payment": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing requests payment via wire transfer, "
                "Western Union, MoneyGram, Zelle, Cash App, gift cards, or any other "
                "off-platform / irreversible payment method. "
                "If no payment method is mentioned, return false."
            ),
        },
        "owner_claims_to_be_abroad": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the owner/landlord explicitly claims to be "
                "out of the country, deployed in the military, relocated for work, "
                "or otherwise unable to show the unit in person. "
                "If no such claim appears, return false."
            ),
        },
        "withholds_address_until_contact": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing explicitly withholds the property "
                "address (e.g., 'address upon serious inquiry', 'message for address'). "
                "If a specific street address is shown, return false. "
                "If no address is mentioned at all, return false."
            ),
        },
        "no_in_person_viewing_offered": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing requires email-only contact and "
                "explicitly disallows or avoids in-person viewings (e.g., 'email only', "
                "'no calls', 'no in-person showings'). "
                "If a phone number, tour link, or open-house time is shown, return false."
            ),
        },
        "unusual_incentives": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing offers unusually generous incentives "
                "that suggest below-market pricing or pressure to commit (e.g., "
                "'first month free', 'no deposit', 'rent well below market'). "
                "Standard offers like 'pet rent waived' or 'parking included' do NOT count. "
                "If no incentives are mentioned, return false."
            ),
        },
    },
    "required": [
        "demands_off_platform_payment",
        "owner_claims_to_be_abroad",
        "withholds_address_until_contact",
        "no_in_person_viewing_offered",
        "unusual_incentives",
    ],
    "additionalProperties": False,
}

# Weights chosen so any single canonical scam signal alone (off-platform
# payment) clears the SPAM_HIDE_THRESHOLD=50, while soft signals
# accumulate before tripping it.
_SPAM_WEIGHTS: dict[str, int] = {
    "demands_off_platform_payment": 60,
    "owner_claims_to_be_abroad": 30,
    "withholds_address_until_contact": 25,
    "no_in_person_viewing_offered": 20,
    "unusual_incentives": 15,
}

# Sources we trust enough to skip spam scoring on.
_TRUSTED_SOURCES = {"apartments", "zillow", "redfin", "realtor", "trulia", "rent", "hotpads"}


def _compute_spam_score(content: dict) -> tuple[int, list[str]]:
    score = 0
    flags: list[str] = []
    for key, weight in _SPAM_WEIGHTS.items():
        if content.get(key) is True:
            score += weight
            flags.append(key)
    return min(100, score), flags


async def _score_spam(client: ParallelClient, listing: dict, timeout: float = 90.0) -> tuple[int, list[str]]:
    """Run a Task-API enrichment to classify the listing.
    Returns (score 0-100, flags). Score is computed in code from the
    boolean facts the API verified — keeps the model's job factual."""
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
            processor=TASK_SPAM_PROCESSOR,
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
        return _compute_spam_score(content)
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
    """Keep the list short and forgiving. Strict conditions cause zero-match
    runs (FindAll can't always verify them from page text). We rely on
    enrichments for the actual data, and post-filter in _candidate_to_listing
    for hard rejections (bad URLs, missing addresses, wrong bedroom count)."""
    blocked_clause = ""
    if BLOCKED_DOMAINS:
        listed = ", ".join(BLOCKED_DOMAINS)
        blocked_clause = (
            f" Reject any candidate whose URL is on these domains: {listed}. "
            f"Prefer the original landlord's, broker's, or property-management website "
            f"over those aggregators."
        )
    return [
        {"name": "is_rental_listing",
         "description": (
             f"The page is an individual rental property listing in or near {CITY_SHORT}. "
             "It advertises a specific unit available to rent. "
             "Not a search results page, not a news article, not a category index."
             + blocked_clause +
             " If the page describes a real property in the target area "
             "(and is not on a blocked domain), mark this matched."
         )},
        {"name": "fits_budget",
         "description": (
             f"The asking monthly rent is at or below ${budget} US dollars. "
             "If the rent is not shown on the page, treat this as matched (do not reject for missing data)."
         )},
    ]


def _enrichments() -> list[dict]:
    """Fields a renter actually wants to know before contacting a landlord.

    Each description follows the cookbook's structure:
    Entity → Action → Specifics → Error Handling. Standardizing on an
    empty string ("") for unknowns gives us a single sentinel to test
    instead of N/A / null / "Not specified" / etc."""
    return [
        {"name": "street_address",
         "description": (
             "Entity: this rental listing's unit address. "
             "Action: extract the exact street address as written on the page. "
             "Specifics: include unit/apt number if shown (e.g. '1234 Mission St #4'); "
             "do not include city, state, or zip. "
             "If only a neighborhood or no street address is shown, return an empty string."
         )},
        {"name": "monthly_rent_usd",
         "description": (
             "Entity: this rental unit's asking monthly rent. "
             "Action: extract the listed monthly rent. "
             "Specifics: an integer in US dollars, no '$' sign, no commas, no '/mo' "
             "suffix (e.g. '4500' for $4,500/month). Use the headline rent, NOT a "
             "deposit, application fee, security deposit, or 'starting at' range minimum. "
             "Do NOT confuse the rent with the street number of the address, the zip "
             "code, the year built, or square footage. "
             "If no monthly rent is shown on the page, return an empty string."
         )},
        {"name": "bedrooms",
         "description": (
             "Entity: this rental unit. "
             "Action: extract the bedroom count of the unit being advertised. "
             "Specifics: an integer (e.g. '0' for studio, '3' for a 3-bedroom). "
             "Pick the number for the specific unit; do not return a range or "
             "the bedroom counts of other units in the same building. "
             "If the bedroom count is not shown, return an empty string."
         )},
        {"name": "bathrooms",
         "description": (
             "Entity: this rental unit. "
             "Action: extract the bathroom count. "
             "Specifics: as a decimal number (e.g. '1', '1.5', '2.5'). "
             "If the page does not state a bathroom count, return an empty string."
         )},
        {"name": "square_feet",
         "description": (
             "Entity: this rental unit. "
             "Action: extract the interior square footage. "
             "Specifics: as an integer with no commas or 'sqft' suffix (e.g. '1200'). "
             "If the page does not state square footage, return an empty string."
         )},
        {"name": "available_date",
         "description": (
             "Entity: this rental unit's first move-in date. "
             "Action: extract the date the unit is or becomes available. "
             "Specifics: prefer ISO format YYYY-MM-DD if a specific date is shown. "
             "Otherwise return one of these phrases verbatim: 'available now', "
             "'available immediately', or 'available soon'. "
             "If no availability information appears, return an empty string."
         )},
        {"name": "lease_term",
         "description": (
             "Entity: this rental unit's lease length. "
             "Action: extract the lease length and type. "
             "Specifics: short phrase (e.g. '12-month', 'month-to-month', "
             "'6-month minimum', 'flexible'). "
             "If no lease term is mentioned, return an empty string."
         )},
        {"name": "pet_policy",
         "description": (
             "Entity: this rental unit's pet policy. "
             "Action: extract whether pets are allowed and any restrictions. "
             "Specifics: short phrase (e.g. 'Cats OK, no dogs', 'No pets', "
             "'Dogs under 25lb', 'Pets allowed'). "
             "If pets are not mentioned at all, return an empty string."
         )},
        {"name": "is_furnished",
         "description": (
             "Entity: this rental unit. "
             "Action: classify the furnishing status. "
             "Specifics: return one of exactly: 'furnished', 'partially furnished', "
             "'unfurnished'. "
             "If furnishing isn't mentioned, return an empty string."
         )},
        {"name": "utilities_included",
         "description": (
             "Entity: this rental unit. "
             "Action: extract which utilities are included in rent. "
             "Specifics: comma-separated list (e.g. 'water, trash', 'all included', "
             "'none included'). "
             "If utilities are not mentioned, return an empty string."
         )},
        {"name": "parking_type",
         "description": (
             "Entity: this rental unit. "
             "Action: classify the parking situation. "
             "Specifics: short phrase (e.g. 'garage included', '1 covered spot', "
             "'street only', 'no parking', 'extra $200/mo'). "
             "If parking is not mentioned, return an empty string."
         )},
        {"name": "laundry_type",
         "description": (
             "Entity: this rental unit. "
             "Action: classify the laundry situation. "
             "Specifics: short phrase (e.g. 'in-unit washer/dryer', "
             "'shared on floor', 'coin-op in basement', 'none'). "
             "If laundry is not mentioned, return an empty string."
         )},
        {"name": "building_amenities",
         "description": (
             "Entity: the building or property containing this unit. "
             "Action: extract building-level amenities (not unit-specific). "
             "Specifics: comma-separated list of features (e.g. "
             "'gym, rooftop, doorman, elevator, pool'). Exclude utilities and "
             "in-unit features. "
             "If no building amenities are listed, return an empty string."
         )},
        {"name": "neighborhood",
         "description": (
             "Entity: the city neighborhood of this unit. "
             "Action: extract the specific neighborhood name. "
             "Specifics: a single name like 'Mission', 'SoMa', 'Hayes Valley'; "
             "do not return the city or zip code. "
             "If only the city is mentioned, return an empty string."
         )},
        {"name": "contact_phone",
         "description": (
             "Entity: the contact for this listing. "
             "Action: extract a phone number to inquire about the unit. "
             "Specifics: plain digits with separators (e.g. '(415) 555-1234'). "
             "If no phone number is shown on the page, return an empty string."
         )},
        {"name": "contact_email",
         "description": (
             "Entity: the contact for this listing. "
             "Action: extract an email address to inquire about the unit. "
             "Specifics: a single email address (e.g. 'leasing@example.com'). "
             "If no email is shown on the page, return an empty string."
         )},
        {"name": "is_currently_active",
         "description": (
             "Entity: the listing status of this rental unit. "
             "Action: determine whether the unit is currently being actively marketed. "
             "Specifics: return 'yes' if the page shows this unit is available to rent right now. "
             "Return 'no' if the page indicates the unit is leased, rented, pending, off-market, "
             "no-longer-available, or 'this listing has been removed'. "
             "If the page is reachable and shows a normal listing without a removed/rented "
             "status banner, return 'yes' (assume listed because it's findable)."
         )},
        {"name": "days_on_market",
         "description": (
             "Entity: this rental listing. "
             "Action: extract how many days the unit has been on the market. "
             "Specifics: an integer (e.g. '7'). Use 'days on market', 'listed N days ago', "
             "'posted N days ago', or compute from a 'first listed' / 'posted on' date. "
             "If only a posted date is shown without an explicit count, compute the days "
             "between that date and today. "
             "If no posted date or days-on-market is shown anywhere, return an empty string."
         )},
    ]


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
                enrichments=_enrichments(),
                generator=FINDALL_GENERATOR,
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
                l = _candidate_to_listing(c, min_beds=task.min_beds)
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
