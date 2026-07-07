from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..controllers.task_controller import create_search_task, get_task_for_streaming
from ..middleware.auth import require_internal_key
from ..models.schemas import SearchRequest
from ..services.search_service import stream_task

router = APIRouter()


@router.post("/api/tasks", dependencies=[Depends(require_internal_key)])
async def create_search_task_route(body: SearchRequest):
    return await create_search_task(
        query=body.query,
        budget=body.budget,
        city=body.city,
        requirements=body.requirements,
    )


@router.get("/api/tasks/{task_id}/stream")
async def stream_search_task_route(task_id: str):
    task = get_task_for_streaming(task_id)
    if not task:
        from fastapi.responses import JSONResponse
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
