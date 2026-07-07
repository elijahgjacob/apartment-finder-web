from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .database import get_db
from ..utils.parsing import _normalize_address


def save_listing(listing_data: dict) -> str | None:
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

    lat = listing_data.get("lat")
    lng = listing_data.get("lng")

    db.execute(
        """INSERT OR REPLACE INTO listings
           (id, source, title, url, price, bedrooms, bathrooms, sqft,
            address, neighborhood, lat, lng, has_parking, has_laundry,
            spam_score, spam_flags, phone, body, details,
            match_basis, citations,
            listed_at, fetched_at, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
            json.dumps(listing_data.get("match_basis") or []),
            json.dumps(listing_data.get("citations") or []),
            now,
            now,
            1,
        ),
    )
    db.commit()
    return listing_id


def get_active_listings(budget: int, show_spam: bool, spam_hide_threshold: int):
    db = get_db()
    return db.execute(
        """
        SELECT id, source, title, url, price, bedrooms, bathrooms, sqft,
               address, neighborhood, lat, lng, has_parking, has_laundry,
               spam_score, spam_flags, phone, body, details,
               match_basis, citations,
               listed_at, fetched_at
          FROM listings
         WHERE is_active = 1
           AND (? IS NULL OR price IS NULL OR price <= ?)
           AND (? = 1 OR spam_score <= ?)
         ORDER BY listed_at DESC
        """,
        (budget, budget, 1 if show_spam else 0, spam_hide_threshold),
    ).fetchall()


def get_ungeocoded_listings():
    db = get_db()
    return db.execute(
        "SELECT id, address, title, details FROM listings WHERE lat IS NULL AND is_active = 1"
    ).fetchall()


def update_listing_geocode(listing_id: str, lat: float, lng: float) -> None:
    db = get_db()
    db.execute("UPDATE listings SET lat = ?, lng = ? WHERE id = ?", (lat, lng, listing_id))
    db.commit()
