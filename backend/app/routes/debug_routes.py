from fastapi import APIRouter, Query

from ..services.api_logger import get_recent_calls, get_stats

router = APIRouter()


@router.get("/api/debug/api-calls")
async def list_api_calls(limit: int = Query(default=100, le=200)):
    return {
        "calls": get_recent_calls(limit),
        "stats": get_stats(),
    }
