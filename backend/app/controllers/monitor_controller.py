from __future__ import annotations

import os

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from ..services.parallel_client import ParallelClient
from ..services.monitor_service import (
    get_status as monitor_status,
    replace_monitor,
    delete_monitor,
)


async def get_monitor_status() -> JSONResponse:
    """Live state of the background Monitor — id, frequency, last run, recent event count."""
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        return JSONResponse(await monitor_status(None))
    async with ParallelClient(api_key=api_key) as client:
        return JSONResponse(await monitor_status(client))


async def replace_monitor_query(query: str) -> JSONResponse:
    """Stop the current Monitor and create a fresh one watching `query`."""
    if not query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="PARALLEL_API_KEY not set")
    async with ParallelClient(api_key=api_key) as client:
        await replace_monitor(client, query)
        return JSONResponse(await monitor_status(client))


async def stop_monitor() -> JSONResponse:
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="PARALLEL_API_KEY not set")
    async with ParallelClient(api_key=api_key) as client:
        deleted = await delete_monitor(client)
    return JSONResponse({"deleted": deleted})
