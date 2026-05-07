"""Async HTTP client for Parallel APIs.

Replaces subprocess calls to parallel-cli with direct HTTP. Same surface
the rest of app/tasks.py needs: findall.create, findall.result, findall.enrich,
plus task_runs.create + result for per-listing enrichment (e.g. spam scoring).
"""

from __future__ import annotations

import os
from typing import Any

import httpx

API_BASE = os.environ.get("PARALLEL_API_BASE", "https://api.parallel.ai")
FINDALL_BETA = "findall-2025-09-15"
SEARCH_EXTRACT_BETA = "search-extract-2025-10-10"


class ParallelClient:
    def __init__(self, api_key: str | None = None, timeout: float = 30.0):
        key = api_key or os.environ.get("PARALLEL_API_KEY")
        if not key:
            raise RuntimeError("PARALLEL_API_KEY not set")
        self._key = key
        self._client = httpx.AsyncClient(
            base_url=API_BASE,
            timeout=timeout,
            headers={"x-api-key": key},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "ParallelClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    # ── FindAll ──────────────────────────────────────────────────────────

    async def findall_create(
        self,
        objective: str,
        entity_type: str,
        match_conditions: list[dict],
        enrichments: list[dict] | None = None,
        generator: str = "core",
        match_limit: int = 25,
    ) -> dict:
        body: dict[str, Any] = {
            "objective": objective,
            "entity_type": entity_type,
            "match_conditions": match_conditions,
            "generator": generator,
            "match_limit": match_limit,
        }
        if enrichments:
            body["enrichments"] = enrichments
        r = await self._client.post(
            "/v1beta/findall/runs",
            json=body,
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_result(self, findall_id: str) -> dict:
        r = await self._client.get(
            f"/v1beta/findall/runs/{findall_id}/result",
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_status(self, findall_id: str) -> dict:
        r = await self._client.get(
            f"/v1beta/findall/runs/{findall_id}",
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_enrich(self, findall_id: str, output_schema: dict, processor: str = "base") -> dict:
        r = await self._client.post(
            f"/v1beta/findall/runs/{findall_id}/enrich",
            json={"processor": processor, "output_schema": output_schema},
            headers={"parallel-beta": FINDALL_BETA},
            timeout=60.0,
        )
        r.raise_for_status()
        return r.json()

    # ── Task API (per-entity enrichment, e.g. spam scoring) ──────────────

    async def task_create(
        self,
        input_data: dict | str,
        output_schema: dict,
        processor: str = "base",
    ) -> dict:
        r = await self._client.post(
            "/v1/tasks/runs",
            json={
                "input": input_data,
                "task_spec": {"output_schema": {"type": "json", "json_schema": output_schema}},
                "processor": processor,
            },
        )
        r.raise_for_status()
        return r.json()

    async def task_result(self, run_id: str) -> dict:
        r = await self._client.get(f"/v1/tasks/runs/{run_id}/result")
        r.raise_for_status()
        return r.json()

    async def task_status(self, run_id: str) -> dict:
        r = await self._client.get(f"/v1/tasks/runs/{run_id}")
        r.raise_for_status()
        return r.json()
