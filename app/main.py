from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

from .listings import (
    DEFAULT_BUDGET,
    get_listings,
    relative_time,
    signal_label,
    search_url,
)

app = FastAPI(title="SF Apartment Finder")

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
templates.env.globals.update(
    relative_time=relative_time,
    signal_label=signal_label,
    search_url=search_url,
)


def _clamp_budget(raw: int | None) -> int:
    if raw is None:
        return DEFAULT_BUDGET
    if raw <= 0:
        return DEFAULT_BUDGET
    return min(max(raw, 1000), 20_000)


@app.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    budget: int | None = Query(default=None),
    showSpam: str | None = Query(default=None),
):
    b = _clamp_budget(budget)
    show_spam = showSpam == "1"
    listings = get_listings(budget=b, show_spam=show_spam)

    high = sum(1 for l in listings if l.score >= 70)
    mid = sum(1 for l in listings if 45 <= l.score < 70)
    low = sum(1 for l in listings if l.score < 45)
    top = listings[:10]

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "listings": listings,
            "top": top,
            "total": len(listings),
            "high": high,
            "mid": mid,
            "low": low,
            "budget": b,
            "show_spam": show_spam,
        },
    )
