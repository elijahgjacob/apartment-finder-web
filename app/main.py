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
    DEFAULT_BUDGET, DEFAULT_QUERY,
    MONITOR_POLL_SECONDS,
    REFERENCE_POINT_NAME, REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
    MAP_CENTER_LAT, MAP_CENTER_LNG, MAP_ZOOM,
)
from .db import get_db
from .geocode import geocode_address
from .listings import get_listings, Listing
from .monitor import (
    ensure_monitor,
    get_status as monitor_status,
    poll_once as monitor_poll_once,
    replace_monitor,
    delete_monitor,
)
from .parallel_client import ParallelClient
from .tasks import create_task, get_task, run_task, stream_task


_bg_lock = asyncio.Lock()                       # protects bg loop from itself
_current_user_task: asyncio.Task | None = None  # cancel-and-replace handle for user searches


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


async def _monitor_poll_loop():
    """Background task: own one Parallel Monitor and pull events on a short
    cadence. Replaces the previous FindAll polling cron — Monitor handles
    discovery + dedup natively, we only persist new event_ids and render."""
    await asyncio.sleep(2)
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        print("[monitor] PARALLEL_API_KEY not set — monitor loop disabled")
        return

    while True:
        try:
            async with ParallelClient(api_key=api_key) as client:
                mon = await ensure_monitor(client)
                monitor_id = mon["monitor_id"]
                while True:
                    if _bg_lock.locked():
                        # never two pollers at once
                        await asyncio.sleep(MONITOR_POLL_SECONDS)
                        continue
                    async with _bg_lock:
                        new_listings = await monitor_poll_once(client, monitor_id)
                        if new_listings:
                            await asyncio.to_thread(_backfill_geocodes)
                    await asyncio.sleep(MONITOR_POLL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[monitor] loop error: {e}; retrying in 30s")
            await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bg = asyncio.create_task(_monitor_poll_loop())
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
        "score": l.score,
        "listed_at": l.listed_at.isoformat() if l.listed_at else None,
        "fetched_at": l.fetched_at.isoformat() if l.fetched_at else None,
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


@app.get("/api/monitor")
async def get_monitor_status():
    """Live state of the background Monitor — id, frequency, last run, recent event count."""
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        return JSONResponse(await monitor_status(None))
    async with ParallelClient(api_key=api_key) as client:
        return JSONResponse(await monitor_status(client))


class MonitorReplaceRequest(BaseModel):
    query: str


@app.post("/api/monitor", dependencies=[Depends(require_internal_key)])
async def replace_monitor_query(body: MonitorReplaceRequest):
    """Stop the current Monitor and create a fresh one watching `query`.
    Use to switch the always-on watch from the default seed query to
    whatever the user just searched for."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="PARALLEL_API_KEY not set")
    async with ParallelClient(api_key=api_key) as client:
        await replace_monitor(client, body.query)
        return JSONResponse(await monitor_status(client))


@app.delete("/api/monitor", dependencies=[Depends(require_internal_key)])
async def stop_monitor():
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="PARALLEL_API_KEY not set")
    async with ParallelClient(api_key=api_key) as client:
        deleted = await delete_monitor(client)
    return JSONResponse({"deleted": deleted})


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
    """Cancel-and-replace: typing a new query cancels the previous user search.
    Independent of the background loop — both can run concurrently."""
    global _current_user_task

    prev = _current_user_task
    if prev and not prev.done():
        prev.cancel()
        try:
            await asyncio.wait_for(prev, timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            pass

    task = create_task(query=body.query, budget=body.budget)
    _current_user_task = asyncio.create_task(run_task(task))
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
