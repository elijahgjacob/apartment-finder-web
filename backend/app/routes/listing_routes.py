from fastapi import APIRouter, Query

from ..config import DEFAULT_BUDGET
from ..controllers.listing_controller import list_listings

router = APIRouter()


@router.get("/api/listings")
async def list_listings_route(
    budget: int = Query(default=DEFAULT_BUDGET),
    show_spam: bool = Query(default=False),
):
    return await list_listings(budget=budget, show_spam=show_spam)
