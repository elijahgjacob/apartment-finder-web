from fastapi import APIRouter

from .health_routes import router as health_router
from .config_routes import router as config_router
from .task_routes import router as task_router
from .debug_routes import router as debug_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(config_router)
api_router.include_router(task_router)
api_router.include_router(debug_router)
