from fastapi import APIRouter, Depends

from ..controllers.monitor_controller import (
    get_monitor_status,
    replace_monitor_query,
    stop_monitor,
)
from ..middleware.auth import require_internal_key
from ..models.schemas import MonitorReplaceRequest

router = APIRouter()


@router.get("/api/monitor")
async def get_monitor_status_route():
    return await get_monitor_status()


@router.post("/api/monitor", dependencies=[Depends(require_internal_key)])
async def replace_monitor_route(body: MonitorReplaceRequest):
    return await replace_monitor_query(body.query)


@router.delete("/api/monitor", dependencies=[Depends(require_internal_key)])
async def stop_monitor_route():
    return await stop_monitor()
