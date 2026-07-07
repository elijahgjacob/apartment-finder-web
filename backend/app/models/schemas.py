from pydantic import BaseModel

from ..config import DEFAULT_BUDGET


class MonitorReplaceRequest(BaseModel):
    query: str


class SearchRequest(BaseModel):
    query: str
    budget: int = DEFAULT_BUDGET
