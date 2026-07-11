from __future__ import annotations

import asyncio
import json
import math
import os
import re
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import AsyncIterator

import httpx

from ..config import (
    BLOCKED_DOMAINS,
    CITY_SHORT,
    FINDALL_GENERATOR,
    FINDALL_MATCH_LIMIT,
    FINDALL_ENRICH_PROCESSOR,
    LISTING_SITES,
    RENT_FLOORS,
    REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
)
from ..models.task import Task, TaskStatus
from ..utils.parsing import (
    _parse_int, _address_from_name, _output_val, _output_float, _output_bool,
    _normalize_address,
)
from .geocode_service import geocode_address
from .parallel_client import ParallelClient


# ── Task / SSE plumbing ──────────────────────────────────────────────────

def _extract_min_beds(query: str) -> int | None:
    m = re.search(r"(\d+)\s*(?:br|bed|bedroom)", query, re.IGNORECASE)
    return int(m.group(1)) if m else None


# Bounded task registry. Search tasks live only long enough for the client
# to open the SSE stream and drain events; keeping every task forever would
# leak memory on a public deployment. Evict oldest once we exceed the cap.
_MAX_TASKS = int(os.environ.get("MAX_TRACKED_TASKS", "200"))
_tasks: "OrderedDict[str, Task]" = OrderedDict()


def get_task(task_id: str) -> Task | None:
    return _tasks.get(task_id)


def _register_task(task: Task) -> None:
    _tasks[task.id] = task
    while len(_tasks) > _MAX_TASKS:
        _tasks.popitem(last=False)


def create_task(
    query: str,
    budget: int,
    min_beds: int | None = None,
    city: str | None = None,
    requirements: str | None = None,
) -> Task:
    if min_beds is None:
        min_beds = _extract_min_beds(query)
    task = Task(
        id=str(uuid.uuid4()),
        query=query,
        budget=budget,
        city=city or CITY_SHORT,
        requirements=requirements,
        min_beds=min_beds,
    )
    _register_task(task)
    return task


# ── Helpers ──────────────────────────────────────────────────────────────

def _absolute_min_price(beds: int | None) -> int:
    """Lower bound for plausibility checks. Uses RENT_FLOORS from config
    (env-overridable). If we don't know the bed count, use a $400 floor.
    Otherwise use 55% of the configured floor for that bedroom count."""
    if beds is None:
        return 400
    typical = RENT_FLOORS.get(beds) or RENT_FLOORS.get(min(beds, 5)) or 800
    return int(typical * 0.55)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _score_listing(listing: dict, budget: int) -> int:
    """Equal-weight 3-factor score (recency + price fit + proximity), max 100.
    Computed in-session — every result is freshly discovered, so recency is
    always full. Proximity is measured to the configured reference point."""
    score = 33  # recency: just discovered by this search

    price = listing.get("price")
    beds = listing.get("bedrooms")
    if price:
        typical = RENT_FLOORS.get(beds) if beds is not None else None
        if typical is None and beds is not None:
            typical = RENT_FLOORS.get(min(beds, 5))
        ratio = price / budget if budget else 1.0
        if ratio > 1.0:
            price_pts = 0
        elif typical is not None and price < typical * 0.6:
            price_pts = 6
        elif ratio <= 0.7:
            price_pts = 33
        elif ratio <= 0.8:
            price_pts = 28
        elif ratio <= 0.9:
            price_pts = 22
        else:
            price_pts = 14
        score += price_pts

    lat, lng = listing.get("lat"), listing.get("lng")
    if lat is not None and lng is not None:
        km = _haversine_km(lat, lng, REFERENCE_POINT_LAT, REFERENCE_POINT_LNG)
        if km < 1.0:
            score += 33
        elif km < 2.5:
            score += 24
        elif km < 5.0:
            score += 16
        else:
            score += 9

    return min(score, 100)


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

    if is_blocked_url(url):
        return None

    search_page_patterns = [
        r"/apartments/$",
        r"/apartments-\d+-bedrooms/$",
        r"/apartments-under-\d+/$",
        r"/\d+-bedroom-apartments",
        r"/rentals$",
        r"/apartments/[a-z-]+(?:/|$)",
    ]
    for pat in search_page_patterns:
        if re.search(pat, url, re.IGNORECASE):
            return None

    address = _output_val(output, "street_address") or _address_from_name(name) or name
    if not address or len(address) < 5:
        return None

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

    if price is not None and (price < 500 or price > 50000):
        price = None
    if beds is not None and (beds < 0 or beds > 10):
        beds = None

    if price is not None:
        if price < _absolute_min_price(beds):
            return None

    if price is not None:
        for n in re.findall(r"\d+", address):
            if int(n) == price:
                return None

    if min_beds and beds is not None and beds < min_beds:
        return None

    junk_patterns = [
        r"^[A-Z][a-z]+,?\s+[A-Z]{2}$",
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
    details = {k: v for k, v in details.items() if v not in (None, "", [], {})}

    match_basis = []
    for key, obj in output.items():
        if obj.get("type") == "match_condition":
            match_basis.append({
                "name": key,
                "value": obj.get("value", ""),
                "matched": bool(obj.get("is_matched")),
            })

    citations = []
    for b in (candidate.get("basis") or []):
        for c in (b.get("citations") or []):
            url_c = c.get("url") or ""
            title = c.get("title") or url_c
            if url_c:
                citations.append({"title": title[:120], "url": url_c})
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
        "match_basis": match_basis,
        "citations": unique_citations[:5],
    }


# ── FindAll match conditions ─────────────────────────────────────────────

def _match_conditions(min_beds: int | None, budget: int, city: str = "") -> list[dict]:
    """Keep the list short and forgiving. Strict conditions cause zero-match
    runs (FindAll can't always verify them from page text). We rely on
    enrichments for the actual data, and post-filter in _candidate_to_listing
    for hard rejections (bad URLs, missing addresses, wrong bedroom count)."""
    city = city or CITY_SHORT
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
             f"The page is an individual rental property listing in or near {city}. "
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
             "Specifics: include unit/apt number if shown (e.g. '123 Main St #4'); "
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
             "Specifics: a single name like 'Downtown', 'Midtown', 'Old Town'; "
             "do not return the city or zip code. "
             "If only the city is mentioned, return an empty string."
         )},
        {"name": "contact_phone",
         "description": (
             "Entity: the contact for this listing. "
             "Action: extract a phone number to inquire about the unit. "
             "Specifics: plain digits with separators (e.g. '(555) 555-1234'). "
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


def _enrichment_output_schema() -> dict:
    """FindAll returns only match-condition fields inline; the per-listing
    facts (price, beds, address, …) come from a dedicated enrichment pass.
    Build its JSON schema from the same field set used for discovery."""
    props = {e["name"]: {"type": "string", "description": e["description"]}
             for e in _enrichments()}
    return {
        "type": "object",
        "properties": props,
        "required": list(props.keys()),
        "additionalProperties": False,
    }


# ── Main task runner ─────────────────────────────────────────────────────

async def run_task(task: Task) -> None:
    task.status = TaskStatus.RUNNING
    task._push({"event": "status", "status": "running"})

    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        task.status = TaskStatus.ERROR
        task._push({"event": "error", "message": "PARALLEL_API_KEY is not set — add it to .env"})
        return

    city = task.city or CITY_SHORT
    beds_str = f"{task.min_beds} bedroom " if task.min_beds else ""
    objective = (
        f"Find {beds_str}apartments for rent "
        f"under {task.budget} dollars per month "
        f"in {city}"
    )
    if task.query and city.lower() not in task.query.lower():
        objective += f". {task.query}"
    if task.requirements:
        objective += f". Requirements: {task.requirements}"

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
                match_conditions=_match_conditions(task.min_beds, task.budget, city),
                enrichments=_enrichments(),
                generator=FINDALL_GENERATOR,
                match_limit=FINDALL_MATCH_LIMIT,
            )
            findall_id = run_data.get("findall_id") or run_data.get("run_id")
            if not findall_id:
                task.status = TaskStatus.ERROR
                task._push({"event": "error", "message": "FindAll create returned no id"})
                return
            task._push({"event": "reasoning", "text": f"Run: {findall_id}\n"})
            task._push({"event": "reasoning", "text": "Searching and verifying candidates…\n\n"})
            task._push({"event": "phase", "key": "discover",
                        "detail": "Searching the web for listings…"})

            # 1) Discovery — wait for FindAll to verify matching listings.
            prev_generated = prev_matched = 0
            state = ""
            for _ in range(90):  # safety cap (~9 min at 6s)
                await asyncio.sleep(6)
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
                                "text": f"Progress: {generated} found, {matched} verified\n"})
                    task._push({"event": "phase", "key": "discover",
                                "detail": f"Verifying candidates — {generated} found · {matched} match"})
                    prev_generated, prev_matched = generated, matched

                if state == "completed":
                    task._push({"event": "reasoning",
                                "text": f"\nVerified {matched}. Extracting listing details…\n"})
                    break

            # 2) Enrichment — discovery only returns match-condition text, so
            #    run a structured pass to fill in price, beds, address, etc.
            try:
                await client.findall_enrich(
                    findall_id,
                    output_schema={"type": "json", "json_schema": _enrichment_output_schema()},
                    processor=FINDALL_ENRICH_PROCESSOR,
                )
            except httpx.HTTPError as e:
                task._push({"event": "reasoning",
                            "text": f"(enrichment request failed: {e}; using what's available)\n"})

            # The enrich pass runs as its own job phase: findall_status flips
            # back to "running" and returns to "completed" when the structured
            # values are filled in. Wait for that signal so we don't parse
            # half-empty listings — and narrate progress so the (multi-minute)
            # wait never looks frozen.
            task._push({"event": "phase", "key": "extract",
                        "detail": "Extracting price, beds & address…"})

            def _rent_populated(cands: list[dict]) -> int:
                n = 0
                for c in cands:
                    rent = (c.get("output") or {}).get("monthly_rent_usd")
                    if isinstance(rent, dict) and str(rent.get("value") or "").strip():
                        n += 1
                return n

            await asyncio.sleep(5)  # let the enrich job flip status to running
            candidates: list[dict] = []
            prev_ready = -1
            for _ in range(40):  # up to ~3.5 min
                await asyncio.sleep(5)
                task._push({"event": "ping", "ts": datetime.now(timezone.utc).isoformat()})
                try:
                    st = await client.findall_status(findall_id)
                except httpx.HTTPError:
                    continue
                st_obj = st.get("status")
                estate = st_obj.get("status") if isinstance(st_obj, dict) else (st_obj or "")
                try:
                    res = await client.findall_result(findall_id)
                    candidates = [c for c in (res.get("candidates") or [])
                                  if c.get("match_status") == "matched"]
                except httpx.HTTPError:
                    pass

                ready = _rent_populated(candidates)
                total = len(candidates) or FINDALL_MATCH_LIMIT
                if ready != prev_ready:
                    task._push({"event": "reasoning",
                                "text": f"Extracting details… {ready}/{total} ready\n"})
                    task._push({"event": "phase", "key": "extract",
                                "detail": f"Extracting details — {ready}/{total} ready"})
                    prev_ready = ready

                if estate == "completed":
                    break

            # 3) Parse, geocode, score, and stream each listing.
            task._push({"event": "phase", "key": "finalize",
                        "detail": "Mapping & scoring listings…"})
            task._push({"event": "reasoning", "text": "\nMapping & scoring…\n"})
            seen_addresses: set[str] = set()
            sent = 0
            for c in candidates:
                listing = _candidate_to_listing(c, min_beds=task.min_beds)
                if not listing:
                    continue
                norm = _normalize_address(listing.get("address") or "")
                if norm and len(norm) > 3:
                    if norm in seen_addresses:
                        continue
                    seen_addresses.add(norm)

                listing["id"] = str(uuid.uuid4())
                addr = listing.get("address")
                if addr:
                    # Geocode off the event loop (free geocoder ~1/sec).
                    coords = await asyncio.to_thread(geocode_address, addr, city)
                    if coords:
                        listing["lat"], listing["lng"] = coords
                listing["score"] = _score_listing(listing, task.budget)
                sent += 1

                price_str = f"${listing['price']:,}/mo" if listing.get("price") else "—"
                bd = f"{listing['bedrooms']}bd" if listing.get("bedrooms") is not None else "?bd"
                task._push({"event": "reasoning",
                            "text": f"  + {addr or '—'} — {bd} — {price_str}\n"})
                task._push({"event": "listing", "listing": listing})

            task._push({"event": "reasoning", "text": f"\nDone. {sent} listings found.\n"})
            task._push({"event": "phase", "key": "done",
                        "detail": f"{sent} listing{'s' if sent != 1 else ''} found"})
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
