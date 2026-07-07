from __future__ import annotations

import asyncio

import httpx

from ..config import TASK_SPAM_PROCESSOR
from .parallel_client import ParallelClient


# ── Spam scoring via Task API ────────────────────────────────────────────
#
# Per the cookbook: avoid subjective "is_likely_spam" outputs. Decompose
# into fact-based booleans the API can verify with citations, then weight
# them in code. Drop rationale/confidence — both are already returned in
# the Task API's per-field `basis` array.

_SPAM_SCHEMA = {
    "type": "object",
    "properties": {
        "demands_off_platform_payment": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing requests payment via wire transfer, "
                "Western Union, MoneyGram, Zelle, Cash App, gift cards, or any other "
                "off-platform / irreversible payment method. "
                "If no payment method is mentioned, return false."
            ),
        },
        "owner_claims_to_be_abroad": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the owner/landlord explicitly claims to be "
                "out of the country, deployed in the military, relocated for work, "
                "or otherwise unable to show the unit in person. "
                "If no such claim appears, return false."
            ),
        },
        "withholds_address_until_contact": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing explicitly withholds the property "
                "address (e.g., 'address upon serious inquiry', 'message for address'). "
                "If a specific street address is shown, return false. "
                "If no address is mentioned at all, return false."
            ),
        },
        "no_in_person_viewing_offered": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing requires email-only contact and "
                "explicitly disallows or avoids in-person viewings (e.g., 'email only', "
                "'no calls', 'no in-person showings'). "
                "If a phone number, tour link, or open-house time is shown, return false."
            ),
        },
        "unusual_incentives": {
            "type": "boolean",
            "description": (
                "Entity: this rental listing's body text. "
                "Action: determine if the listing offers unusually generous incentives "
                "that suggest below-market pricing or pressure to commit (e.g., "
                "'first month free', 'no deposit', 'rent well below market'). "
                "Standard offers like 'pet rent waived' or 'parking included' do NOT count. "
                "If no incentives are mentioned, return false."
            ),
        },
    },
    "required": [
        "demands_off_platform_payment",
        "owner_claims_to_be_abroad",
        "withholds_address_until_contact",
        "no_in_person_viewing_offered",
        "unusual_incentives",
    ],
    "additionalProperties": False,
}

# Weights chosen so any single canonical scam signal alone (off-platform
# payment) clears the SPAM_HIDE_THRESHOLD=50, while soft signals
# accumulate before tripping it.
_SPAM_WEIGHTS: dict[str, int] = {
    "demands_off_platform_payment": 60,
    "owner_claims_to_be_abroad": 30,
    "withholds_address_until_contact": 25,
    "no_in_person_viewing_offered": 20,
    "unusual_incentives": 15,
}

# Sources we trust enough to skip spam scoring on.
_TRUSTED_SOURCES = {"apartments", "zillow", "redfin", "realtor", "trulia", "rent", "hotpads"}


def _compute_spam_score(content: dict) -> tuple[int, list[str]]:
    score = 0
    flags: list[str] = []
    for key, weight in _SPAM_WEIGHTS.items():
        if content.get(key) is True:
            score += weight
            flags.append(key)
    return min(100, score), flags


async def _score_spam(client: ParallelClient, listing: dict, timeout: float = 90.0) -> tuple[int, list[str]]:
    """Run a Task-API enrichment to classify the listing.
    Returns (score 0-100, flags). Score is computed in code from the
    boolean facts the API verified — keeps the model's job factual."""
    try:
        run = await client.task_create(
            input_data={
                "title": listing.get("title") or "",
                "body": (listing.get("body") or "")[:4000],
                "price": listing.get("price"),
                "address": listing.get("address"),
                "source": listing.get("source"),
            },
            output_schema=_SPAM_SCHEMA,
            processor=TASK_SPAM_PROCESSOR,
        )
        run_id = run.get("run_id")
        if not run_id:
            return 0, ["task_create_no_id"]

        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(4)
            try:
                status = await client.task_status(run_id)
            except httpx.HTTPError:
                continue
            s = status.get("status", "")
            if isinstance(s, dict):
                s = s.get("status", "")
            if s in ("completed", "succeeded"):
                break
            if s in ("failed", "error", "cancelled"):
                return 0, [f"task_{s}"]

        result = await client.task_result(run_id)
        content = ((result.get("output") or {}).get("content")) or {}
        return _compute_spam_score(content)
    except (httpx.HTTPError, asyncio.TimeoutError) as e:
        return 0, [f"task_api_error:{type(e).__name__}"]


async def score_listings_concurrently(
    client: ParallelClient, listings: list[dict], concurrency: int = 5
) -> None:
    """Spam-score each listing in place. Skips trusted sources."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(l: dict) -> None:
        if l.get("source") in _TRUSTED_SOURCES:
            return
        async with sem:
            score, flags = await _score_spam(client, l)
            l["spam_score"] = score
            l["spam_flags"] = flags

    await asyncio.gather(*(_one(l) for l in listings))
