from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .config import (
    REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
    DEFAULT_BUDGET, SPAM_HIDE_THRESHOLD,
)
from .db import get_db

SEARCH_LAT = REFERENCE_POINT_LAT
SEARCH_LNG = REFERENCE_POINT_LNG


@dataclass
class Listing:
    id: str
    source: str
    title: str | None
    url: str | None
    price: int | None
    bedrooms: int | None
    bathrooms: float | None
    sqft: int | None
    address: str | None
    neighborhood: str | None
    lat: float | None
    lng: float | None
    has_parking: bool | None
    has_laundry: bool | None
    spam_score: int
    spam_flags: list[str]
    phone: str | None
    body: str | None
    details: dict
    listed_at: datetime
    fetched_at: datetime
    score: int = 0


def _parse_dt(val: str | None) -> datetime:
    if not val:
        return datetime.now(timezone.utc)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


def _row_to_listing(r: Any) -> Listing:
    keys = set(r.keys())
    raw_details = r["details"] if "details" in keys else "{}"
    try:
        details = json.loads(raw_details or "{}")
    except (TypeError, ValueError):
        details = {}
    return Listing(
        id=r["id"],
        source=r["source"],
        title=r["title"],
        url=r["url"],
        price=r["price"],
        bedrooms=r["bedrooms"],
        bathrooms=r["bathrooms"],
        sqft=r["sqft"],
        address=r["address"],
        neighborhood=r["neighborhood"],
        lat=r["lat"],
        lng=r["lng"],
        has_parking=bool(r["has_parking"]) if r["has_parking"] is not None else None,
        has_laundry=bool(r["has_laundry"]) if r["has_laundry"] is not None else None,
        spam_score=r["spam_score"],
        spam_flags=json.loads(r["spam_flags"] or "[]"),
        phone=r["phone"] if "phone" in keys else None,
        body=r["body"],
        details=details,
        listed_at=_parse_dt(r["listed_at"]),
        fetched_at=_parse_dt(r["fetched_at"]),
    )


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Same numbers used as price-plausibility floor in app/tasks.py — kept
# here too so listings.py doesn't need to import from tasks.
_RENT_FLOORS_SF: dict[int, int] = {
    0: 1900, 1: 2700, 2: 3600, 3: 5200, 4: 6500, 5: 8000,
}


def _typical_rent(beds: int | None) -> int | None:
    if beds is None:
        return None
    return _RENT_FLOORS_SF.get(beds) or _RENT_FLOORS_SF.get(min(beds, 5))


def compute_score(listing: Listing, budget: int) -> int:
    """Equal-weight 3-factor score: each factor contributes at most 33
    points (recency, price fit, proximity to reference). Cap at 100."""
    score = 0

    # ── Recency (max 33) ───────────────────────────────────────────────
    age_hours = (datetime.now(timezone.utc) - listing.listed_at).total_seconds() / 3600
    if age_hours < 24:
        score += 33
    elif age_hours < 72:
        score += 24
    elif age_hours < 168:
        score += 14
    else:
        score += 5

    # ── Price fit (max 33) ─────────────────────────────────────────────
    # U-curve: prices > budget score 0; prices unrealistically below the
    # bedroom-typical floor get 6 (likely parse miscue); the realistic
    # bands get the full top tier.
    if listing.price:
        typical = _typical_rent(listing.bedrooms)
        ratio = listing.price / budget

        if ratio > 1.0:
            price_pts = 0
        elif typical is not None and listing.price < typical * 0.6:
            price_pts = 6
        elif ratio <= 0.7:
            price_pts = 33
        elif ratio <= 0.8:
            price_pts = 28
        elif ratio <= 0.9:
            price_pts = 22
        else:  # 0.9 < ratio <= 1.0
            price_pts = 14

        score += price_pts

    # ── Proximity to reference point (max 33) ──────────────────────────
    if listing.lat is not None and listing.lng is not None:
        km = _haversine_km(listing.lat, listing.lng, SEARCH_LAT, SEARCH_LNG)
        if km < 1.0:
            score += 33
        elif km < 2.5:
            score += 24
        elif km < 5.0:
            score += 16
        else:
            score += 9

    return min(score, 100)


def get_listings(budget: int = DEFAULT_BUDGET, show_spam: bool = False) -> list[Listing]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, source, title, url, price, bedrooms, bathrooms, sqft,
               address, neighborhood, lat, lng, has_parking, has_laundry,
               spam_score, spam_flags, phone, body, details, listed_at, fetched_at
          FROM listings
         WHERE is_active = 1
           AND (? IS NULL OR price IS NULL OR price <= ?)
           AND (? = 1 OR spam_score <= ?)
         ORDER BY listed_at DESC
        """,
        (budget, budget, 1 if show_spam else 0, SPAM_HIDE_THRESHOLD),
    ).fetchall()

    listings = []
    for r in rows:
        l = _row_to_listing(r)
        l.score = compute_score(l, budget)
        listings.append(l)

    listings.sort(key=lambda x: x.score, reverse=True)
    return listings


def relative_time(dt: datetime) -> str:
    ms = (datetime.now(timezone.utc) - dt).total_seconds() * 1000
    m = int(ms / 60_000)
    if m < 60:
        return f"{max(1, m)}m ago"
    h = m // 60
    if h < 24:
        return f"{h}h ago"
    d = h // 24
    return f"{d}d ago"


def signal_label(score: int) -> str:
    if score <= 20:
        return "Clean"
    if score <= 50:
        return "Review"
    return "Spam"


def search_url(listing: Listing) -> str:
    if listing.url:
        return listing.url
    import urllib.parse
    from .config import CITY_SHORT
    q = urllib.parse.quote(f"{listing.address or listing.title or ''} rent {CITY_SHORT}")
    return f"https://www.google.com/search?q={q}"
