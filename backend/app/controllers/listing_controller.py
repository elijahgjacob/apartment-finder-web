from fastapi.responses import JSONResponse

from ..models.listing import Listing
from ..services.listing_service import get_listings


def _listing_to_dict(l: Listing) -> dict:
    """Public listing payload. Phone + email are intentionally NOT exposed via
    the API to avoid broadcasting scraped contact info. The DB still retains
    them. Other renter-relevant facts (move-in date, pet policy, lease term,
    etc.) come from `details`."""
    safe_details = {k: v for k, v in (l.details or {}).items() if k not in ("contact_email",)}
    return {
        "id": l.id,
        "source": l.source,
        "title": l.title,
        "url": l.url,
        "price": l.price,
        "bedrooms": l.bedrooms,
        "bathrooms": l.bathrooms,
        "sqft": l.sqft,
        "address": l.address,
        "neighborhood": l.neighborhood,
        "lat": l.lat,
        "lng": l.lng,
        "has_parking": l.has_parking,
        "has_laundry": l.has_laundry,
        "spam_score": l.spam_score,
        "body": l.body,
        "details": safe_details,
        "match_basis": l.match_basis or [],
        "citations": l.citations or [],
        "score": l.score,
        "listed_at": l.listed_at.isoformat() if l.listed_at else None,
        "fetched_at": l.fetched_at.isoformat() if l.fetched_at else None,
    }


async def list_listings(budget: int, show_spam: bool) -> JSONResponse:
    listings = get_listings(budget=budget, show_spam=show_spam)
    return JSONResponse([_listing_to_dict(l) for l in listings])
