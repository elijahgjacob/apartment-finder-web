"""Async HTTP client for Parallel APIs.

Replaces subprocess calls to parallel-cli with direct HTTP. Same surface
the rest of app/tasks.py needs: findall.create, findall.result, findall.enrich,
plus task_runs.create + result for per-listing enrichment (e.g. spam scoring).
"""

from __future__ import annotations

import json as _json
import os
import time
from typing import Any

import httpx

from .api_logger import log_call

API_BASE = os.environ.get("PARALLEL_API_BASE", "https://api.parallel.ai")
FINDALL_BETA = "findall-2025-09-15"
SEARCH_EXTRACT_BETA = "search-extract-2025-10-10"


def _summarize_body(body: Any, max_len: int = 400) -> str:
    if body is None:
        return ""
    if isinstance(body, dict):
        text = _json.dumps(body, default=str)
    else:
        text = str(body)
    return text[:max_len] + ("…" if len(text) > max_len else "")


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

    async def _request(
        self,
        method: str,
        path: str,
        *,
        api_label: str,
        json: dict | None = None,
        params: dict | None = None,
        headers: dict | None = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        t0 = time.monotonic()
        req_summary = _summarize_body(json or params)
        try:
            r = await self._client.request(
                method,
                path,
                json=json,
                params=params,
                headers=headers,
                timeout=timeout,
            )
            elapsed = (time.monotonic() - t0) * 1000
            resp_text = r.text[:400] if r.text else ""
            log_call(
                api=api_label,
                method=method,
                path=path,
                status_code=r.status_code,
                duration_ms=elapsed,
                request_summary=req_summary,
                response_summary=resp_text,
            )
            return r
        except Exception as exc:
            elapsed = (time.monotonic() - t0) * 1000
            log_call(
                api=api_label,
                method=method,
                path=path,
                duration_ms=elapsed,
                request_summary=req_summary,
                error=f"{type(exc).__name__}: {exc}",
            )
            raise

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
        r = await self._request(
            "POST", "/v1beta/findall/runs",
            api_label="FindAll",
            json=body,
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_result(self, findall_id: str) -> dict:
        r = await self._request(
            "GET", f"/v1beta/findall/runs/{findall_id}/result",
            api_label="FindAll",
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_status(self, findall_id: str) -> dict:
        r = await self._request(
            "GET", f"/v1beta/findall/runs/{findall_id}",
            api_label="FindAll",
            headers={"parallel-beta": FINDALL_BETA},
        )
        r.raise_for_status()
        return r.json()

    async def findall_enrich(self, findall_id: str, output_schema: dict, processor: str = "base") -> dict:
        r = await self._request(
            "POST", f"/v1beta/findall/runs/{findall_id}/enrich",
            api_label="FindAll",
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
        r = await self._request(
            "POST", "/v1/tasks/runs",
            api_label="Task",
            json={
                "input": input_data,
                "task_spec": {"output_schema": {"type": "json", "json_schema": output_schema}},
                "processor": processor,
            },
        )
        r.raise_for_status()
        return r.json()

    async def task_result(self, run_id: str) -> dict:
        r = await self._request(
            "GET", f"/v1/tasks/runs/{run_id}/result",
            api_label="Task",
        )
        r.raise_for_status()
        return r.json()

    async def task_status(self, run_id: str) -> dict:
        r = await self._request(
            "GET", f"/v1/tasks/runs/{run_id}",
            api_label="Task",
        )
        r.raise_for_status()
        return r.json()

    # ── Monitor (v1) ─────────────────────────────────────────────────────

    async def monitor_create(self, body: dict) -> dict:
        r = await self._request(
            "POST", "/v1/monitors",
            api_label="Monitor",
            json=body,
        )
        r.raise_for_status()
        return r.json()

    async def monitor_get(self, monitor_id: str) -> dict:
        r = await self._request(
            "GET", f"/v1/monitors/{monitor_id}",
            api_label="Monitor",
        )
        r.raise_for_status()
        return r.json()

    async def monitor_events(
        self,
        monitor_id: str,
        event_group_id: str | None = None,
        include_completions: bool = False,
    ) -> dict:
        params: dict[str, Any] = {}
        if event_group_id:
            params["event_group_id"] = event_group_id
        if include_completions:
            params["include_completions"] = "true"
        r = await self._request(
            "GET", f"/v1/monitors/{monitor_id}/events",
            api_label="Monitor",
            params=params or None,
        )
        r.raise_for_status()
        return r.json()

    async def monitor_delete(self, monitor_id: str) -> None:
        r = await self._request(
            "POST", f"/v1/monitors/{monitor_id}/cancel",
            api_label="Monitor",
            json={},
        )
        r.raise_for_status()
