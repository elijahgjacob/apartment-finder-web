from fastapi import APIRouter

from ..controllers.config_controller import get_config

router = APIRouter()


@router.get("/api/config")
async def get_config_route():
    return await get_config()
