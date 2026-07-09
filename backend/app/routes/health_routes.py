import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health():
    """Stateless health check — the app keeps no database, so we only report
    whether the Parallel API key is configured."""
    api_key = os.environ.get("PARALLEL_API_KEY")
    return {
        "status": "ok",
        "checks": {
            "parallel_api_key": {"status": "ok" if api_key else "missing"},
        },
    }
