import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from .config import (
    APP_TITLE, CITY, CITY_SHORT,
    DEFAULT_BUDGET, DEFAULT_QUERY, SEARCH_INTERVAL,
    REFERENCE_POINT_NAME, REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
    MAP_CENTER_LAT, MAP_CENTER_LNG, MAP_ZOOM,
)
from .db import get_db
from .geocode import geocode_address
from .listings import get_listings, Listing
from .tasks import create_task, get_task, run_task, stream_task


_search_lock = asyncio.Lock()


def _backfill_geocodes():
    db = get_db()
    rows = db.execute(
        "SELECT id, address, title FROM listings WHERE lat IS NULL AND is_active = 1"
    ).fetchall()
    if not rows:
        return
    print(f"[geocode] Backfilling {len(rows)} listings…")
    for row in rows:
        addr = row["address"] or row["title"] or ""
        if not addr:
            continue
        coords = geocode_address(addr)
        if coords:
            db.execute("UPDATE listings SET lat = ?, lng = ? WHERE id = ?",
                       (coords[0], coords[1], row["id"]))
            db.commit()
            print(f"[geocode] {addr} → {coords[0]:.4f}, {coords[1]:.4f}")
        else:
            print(f"[geocode] {addr} → not found")


async def _background_search_loop():
    await asyncio.sleep(2)
    while True:
        if _search_lock.locked():
            print("[bg] previous search still running — skipping this tick")
        else:
            async with _search_lock:
                try:
                    task = create_task(query=DEFAULT_QUERY, budget=DEFAULT_BUDGET)
                    await run_task(task)
                    await asyncio.to_thread(_backfill_geocodes)
                except Exception as e:
                    print(f"[bg] error: {e}")
        await asyncio.sleep(SEARCH_INTERVAL)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bg = asyncio.create_task(_background_search_loop())
    yield
    bg.cancel()


app = FastAPI(title=APP_TITLE, lifespan=lifespan)


# ── Auth ─────────────────────────────────────────────────────────────────

def require_internal_key(x_api_key: str | None = Header(default=None)):
    """Header check on mutating endpoints. If INTERNAL_API_KEY isn't set
    (e.g. local dev), the check is bypassed."""
    expected = os.environ.get("INTERNAL_API_KEY")
    if not expected:
        return  # dev mode — no auth configured
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing api key")


# ── Serialization ────────────────────────────────────────────────────────

def _listing_to_dict(l: Listing) -> dict:
    """Public listing payload. Phone is intentionally NOT exposed via the API
    to avoid broadcasting scraped contact info. The DB still retains it."""
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
        "score": l.score,
        "listed_at": l.listed_at.isoformat() if l.listed_at else None,
    }


# ── Routes ───────────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return JSONResponse({
        "appTitle": APP_TITLE,
        "city": CITY,
        "cityShort": CITY_SHORT,
        "referencePoint": {
            "name": REFERENCE_POINT_NAME,
            "lat": REFERENCE_POINT_LAT,
            "lng": REFERENCE_POINT_LNG,
        },
        "mapCenter": {"lat": MAP_CENTER_LAT, "lng": MAP_CENTER_LNG},
        "mapZoom": MAP_ZOOM,
        "defaultBudget": DEFAULT_BUDGET,
        "defaultQuery": DEFAULT_QUERY,
    })


@app.get("/api/listings")
async def list_listings(
    budget: int = Query(default=DEFAULT_BUDGET),
    show_spam: bool = Query(default=False),
):
    listings = get_listings(budget=budget, show_spam=show_spam)
    return JSONResponse([_listing_to_dict(l) for l in listings])


class SearchRequest(BaseModel):
    query: str
    budget: int = DEFAULT_BUDGET


@app.post("/api/tasks", dependencies=[Depends(require_internal_key)])
async def create_search_task(body: SearchRequest):
    if _search_lock.locked():
        raise HTTPException(status_code=409, detail="a search is already running; try again shortly")
    task = create_task(query=body.query, budget=body.budget)

    async def _guarded_run():
        async with _search_lock:
            await run_task(task)

    asyncio.create_task(_guarded_run())
    return JSONResponse({"task_id": task.id, "status": task.status.value})


@app.get("/api/tasks/{task_id}/stream")
async def stream_search_task(task_id: str):
    task = get_task(task_id)
    if not task:
        return JSONResponse({"error": "task not found"}, status_code=404)

    return StreamingResponse(
        stream_task(task),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
