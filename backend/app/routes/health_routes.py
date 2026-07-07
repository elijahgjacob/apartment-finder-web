import os

from fastapi import APIRouter

from ..repositories.database import get_db

router = APIRouter()


@router.get("/api/health")
async def health():
    checks: dict = {}

    try:
        db = get_db()
        row = db.execute("SELECT COUNT(*) as cnt FROM listings WHERE is_active = 1").fetchone()
        checks["database"] = {"status": "ok", "active_listings": row["cnt"]}
    except Exception as e:
        checks["database"] = {"status": "error", "error": str(e)}

    api_key = os.environ.get("PARALLEL_API_KEY")
    checks["parallel_api_key"] = {"status": "ok" if api_key else "missing"}

    all_ok = all(
        c.get("status") == "ok" or c.get("status") == "missing"
        for c in checks.values()
    )

    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
    }
