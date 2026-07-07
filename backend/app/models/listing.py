from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


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
    match_basis: list[dict] | None = None
    citations: list[dict] | None = None
    score: int = 0
