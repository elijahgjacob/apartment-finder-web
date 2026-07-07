from __future__ import annotations

import asyncio

from fastapi.responses import JSONResponse

from ..services.search_service import create_task, get_task, run_task, stream_task


_current_user_task: asyncio.Task | None = None


async def create_search_task(query: str, budget: int) -> JSONResponse:
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

    task = create_task(query=query, budget=budget)
    _current_user_task = asyncio.create_task(run_task(task))
    return JSONResponse({"task_id": task.id, "status": task.status.value})


async def stream_search_task(task_id: str) -> JSONResponse | None:
    """Returns None if the task exists (caller should stream), or a JSONResponse error."""
    task = get_task(task_id)
    if not task:
        return JSONResponse({"error": "task not found"}, status_code=404)
    return None


def get_task_for_streaming(task_id: str):
    """Get the task object for SSE streaming."""
    return get_task(task_id)
