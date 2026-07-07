import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import APP_TITLE, MONITOR_POLL_SECONDS
from .repositories.listing_repository import get_ungeocoded_listings, update_listing_geocode
from .services.geocode_service import geocode_address
from .services.monitor_service import ensure_monitor, poll_once as monitor_poll_once
from .services.parallel_client import ParallelClient
from .routes import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("apt-finder")

_bg_lock = asyncio.Lock()


def _backfill_geocodes():
    rows = get_ungeocoded_listings()
    if not rows:
        return
    logger.info("Backfilling geocodes for %d listings", len(rows))
    for row in rows:
        addr = row["address"] or row["title"] or ""
        if not addr:
            continue
        coords = geocode_address(addr)
        if coords:
            update_listing_geocode(row["id"], coords[0], coords[1])
            logger.debug("Geocoded %s → %.4f, %.4f", addr, coords[0], coords[1])
        else:
            logger.debug("Geocode not found for %s", addr)


async def _monitor_poll_loop():
    """Background task: own one Parallel Monitor and pull events on a short
    cadence. Replaces the previous FindAll polling cron — Monitor handles
    discovery + dedup natively, we only persist new event_ids and render."""
    await asyncio.sleep(2)
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        logger.warning("PARALLEL_API_KEY not set — monitor loop disabled")
        return

    while True:
        try:
            async with ParallelClient(api_key=api_key) as client:
                mon = await ensure_monitor(client)
                monitor_id = mon["monitor_id"]
                while True:
                    if _bg_lock.locked():
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
            logger.error("Monitor loop error: %s; retrying in 30s", e)
            await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bg = asyncio.create_task(_monitor_poll_loop())
    yield
    bg.cancel()


app = FastAPI(title=APP_TITLE, lifespan=lifespan)

_allowed = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router)
