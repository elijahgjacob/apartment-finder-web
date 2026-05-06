# Apartment Finder × Parallel APIs — Detailed Implementation Plan

This is the execution plan for the recommendations in `parallel-api-evaluation.md`. Three phases, each independently shippable.

**Repos:**
- `elijahgjacob/apartment-finder` — Python indexer (cron-driven)
- `elijahgjacob/apartment-finder-web` — Next.js 16 frontend

**Status keys:**
- 🟢 = ship-ready after this phase
- 🟡 = behind a flag / shadow mode
- ⏸ = deferred

---

## Phase 1 — Stack B: Search → Extract → Task Enrichment

**Goal:** delete the regex parsing pyramid + heuristic spam score; keep all other architecture (cron, sources, schema, email).

**Why first:** smallest re-architecture, biggest data-quality lift, no new infra, no schema changes.

### 1.1 New file: `indexer/parallel_client.py`

Single-purpose wrapper around three Parallel endpoints. ~80 lines.

```python
# Public surface
class ParallelClient:
    def __init__(self, api_key: str, timeout: int = 120): ...

    # Search (already in use indirectly via run_search; move it here)
    def search(self, queries: list[str], domains: list[str] | None = None,
               max_results: int = 20, after_date: str | None = None) -> list[dict]: ...

    # Extract — batch up to 20 URLs per call
    def extract(self, urls: list[str], objective: str,
                full_content: bool = True, excerpts: bool = False) -> list[dict]: ...

    # Task — sync wrapper with internal poll
    def enrich_listing(self, listing: dict, output_schema: dict,
                       processor: str = "core", poll_interval: int = 5,
                       max_wait: int = 180) -> dict: ...
```

Implementation notes:
- Use `requests` (already a dep). One session, retry with backoff on 5xx.
- Headers: `x-api-key` for all; `parallel-beta: search-extract-2025-10-10` for `/v1beta/search` + `/v1beta/extract`.
- `enrich_listing` polls `GET /v1/tasks/runs/{run_id}/result` until `run.status == completed`. Note status comes back in two shapes — at `run.status` for the result endpoint and at top-level `status` for the run endpoint; handle both.
- Surface the per-field `basis` array on success — callers may want confidence gates.

### 1.2 Replace regex parsing with Extract

In `apartment_indexer.py`, the three scrapers `fetch_craigslist()`, `fetch_zumper()`, `fetch_multisource()` currently do:

1. Search → list of `{url, title, excerpts}`
2. Regex-parse excerpts for price/address/bedrooms

Replace step 2 with: collect URLs from step 1 → batch into Extract calls of 20 → use a **single Task Enrichment** to extract structured fields per page.

**New helper** in `apartment_indexer.py`:

```python
LISTING_FIELDS_SCHEMA = {
    "type": "json",
    "json_schema": {
        "type": "object",
        "properties": {
            "is_three_bedroom": {"type": "boolean"},
            "monthly_rent_usd": {"type": ["integer", "null"]},
            "bedrooms": {"type": ["integer", "null"]},
            "bathrooms": {"type": ["number", "null"]},
            "sqft": {"type": ["integer", "null"]},
            "street_address": {"type": ["string", "null"]},
            "neighborhood": {"type": ["string", "null"]},
            "amenities": {"type": "array", "items": {"type": "string"}},
            "listed_date_iso": {"type": ["string", "null"]},
            "is_listing_active": {"type": "boolean",
                "description": "True if the page is a live listing (not 404, not flagged, not removed)."},
        },
        "required": ["is_three_bedroom", "is_listing_active"],
        "additionalProperties": False,
    }
}

def parse_listing_with_parallel(client, url, page_markdown):
    return client.enrich_listing(
        listing={"url": url, "page_content": page_markdown[:30000]},
        output_schema=LISTING_FIELDS_SCHEMA,
        processor="base",  # base is plenty for field extraction
    )
```

**Flow in each fetcher:**

```python
# Step 1 — search (unchanged)
hits = client.search(queries=[...], domains="zumper.com", ...)

# Step 2 — batch Extract
urls = [h["url"] for h in hits if "/address/" in h["url"]]  # source-specific URL filter
extracts = client.extract(urls=urls[:20], objective="...rental listing fields...")
url_to_md = {e["url"]: e["full_content"] for e in extracts if e.get("full_content")}

# Step 3 — Task per listing (parallel via ThreadPoolExecutor, max_workers=8)
parsed = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    futures = {ex.submit(parse_listing_with_parallel, client, u, md): u
               for u, md in url_to_md.items()}
    for f in concurrent.futures.as_completed(futures):
        u = futures[f]
        try:
            parsed[u] = f.result()
        except Exception as e:
            print(f"  parse failed for {u}: {e}")

# Step 4 — drop is_listing_active=False, build listing dicts
for u, fields in parsed.items():
    if not fields["is_listing_active"] or not fields["is_three_bedroom"]:
        continue
    yield make_listing_from_parsed(u, fields, source="craigslist")
```

### 1.3 Replace `score_spam()` with Task enrichment

```python
SPAM_SCHEMA = {
    "type": "json",
    "json_schema": {
        "type": "object",
        "properties": {
            "is_likely_spam":   {"type": "boolean"},
            "spam_confidence":  {"type": "number"},
            "fraud_signals":    {"type": "array", "items": {"type": "string"}},
            "rationale":        {"type": "string"},
        },
        "required": ["is_likely_spam", "spam_confidence", "fraud_signals", "rationale"],
        "additionalProperties": False,
    }
}

def score_spam_with_task(client, listing):
    out = client.enrich_listing(
        listing={"title": listing["title"], "body": listing["body"],
                 "price": listing["price"], "source": listing["source"]},
        output_schema=SPAM_SCHEMA,
        processor="base",
    )
    score = int(out["spam_confidence"] * 100)
    return score, out["fraud_signals"] + ["task_api"]  # tag for traceability
```

Replaces `score_spam()` in `save_listings()`. Skip for `source == "rentcast"` (already structured).

### 1.4 Files changed

| File | Change |
|---|---|
| `indexer/parallel_client.py` | **new** — ~120 LOC |
| `indexer/apartment_indexer.py` | delete `PRICE_RE`, `IS_3BR_RE`, `NOT_3BR_RE`, `CL_ADDR_RE`, `ZUMPER_*_RE`, `CL_PRICE_*_RE`, `ADDR_RE`, `extract_price`, `extract_neighborhood` (or thin them), `score_spam`, `get_median`, `_medians`. Rewrite `fetch_craigslist`, `fetch_zumper`, `fetch_multisource` to use `parse_listing_with_parallel`. Replace `score_spam()` call in `save_listings()` with `score_spam_with_task()`. |
| `indexer/requirements.txt` | no change (already has `requests`) |
| `indexer/.env.example` | already has `PARALLEL_API_KEY` |

### 1.5 Throughput & cost

Steady-state assumptions per 30-min cron tick:
- Search: ~9 queries (4 CL + 3 Zumper + 2 multi)
- Extract: 1 batch call of ≤20 URLs per source = 3 calls × 20 URLs = 60 URLs
- Task: 1 field-extraction per URL + 1 spam score per *new* listing (typically 0–10/cycle)

Daily: ~430 Extract URLs + ~30–60 base task runs.

### 1.6 Failure handling

- **Extract returns 404 / "flagged for removal":** `is_listing_active=False` → drop it. Set `is_active=FALSE` in DB if the row already exists.
- **Task timeout (>180s):** fall back to keeping the listing with `spam_score=null, spam_flags=["task_timeout"]`. Surface "Unverified" badge on front-end.
- **Parallel API 5xx:** retry once with 5s backoff, then skip the cycle for that source. Don't crash the indexer.

### 1.7 Testing

- **Unit:** mock `ParallelClient` in `test_parser.py`; assert `parse_listing_with_parallel` returns expected fields given fixture markdown.
- **Integration:** run the new pipeline once with `--dry-run` (don't write to DB), pickle the parsed listings, diff against the current run's output. Look for: dropped real listings, new false positives.
- **Shadow mode (1 week):** keep `score_spam()` running alongside `score_spam_with_task()`; write Task verdict to a new column `spam_score_task` instead of replacing. Cut over only when ≥80% agreement on a labeled sample.

### Phase 1 deliverable

🟢 Indexer running on Stack B in production, regex code deleted, spam quality measurably improved.

---

## Phase 2 — Stack D: Monitor → webhook → enrichment

**Goal:** retire cron. Parallel watches the web; we react.

**Prerequisite:** Phase 1 shipped (the webhook handler reuses the same `parse_listing_with_parallel` + `score_spam_with_task`).

### 2.1 Webhook receiver lives in `apartment-finder-web`

New route handler: `apartment-finder-web/src/app/api/parallel/webhook/route.ts`.

Per Parallel's webhooks doc, the payload is small — `{monitor_id, event_group_id, metadata}` — and you fetch the actual events with another API call. So the handler:

```ts
export async function POST(req: Request) {
  const sig = req.headers.get("parallel-signature");
  const body = await req.text();
  if (!verifyHmac(sig, body, process.env.PARALLEL_WEBHOOK_SECRET!)) {
    return new Response("bad signature", { status: 401 });
  }
  const { monitor_id, event_group_id } = JSON.parse(body);

  // Fetch the events for this group
  const events = await fetchMonitorEvents(monitor_id, event_group_id);

  // Each event has a candidate URL → enqueue
  for (const ev of events) {
    await enqueueIngest(ev.url);  // see 2.3
  }

  return Response.json({ ok: true });
}
```

### 2.2 Ingest path

A single function that mirrors the indexer's per-listing path:

```
url → Extract (1 URL) → Task field extraction → Task spam score → upsert into listings
```

Two implementation options:

**Option A (simpler, recommended):** put `parallel_client.py` logic in TS in the web repo. Webhook calls it inline. ~150 LOC of TS.

**Option B:** keep the Python indexer but expose a `/ingest` HTTP endpoint on it that accepts `{url}` and runs the existing pipeline. Webhook handler POSTs to it. Adds a deploy target but reuses code.

Pick **A** unless the indexer is doing meaningful Python-only work elsewhere (it isn't — RentCast + Resend can both be done from the web repo).

### 2.3 Monitor lifecycle

One monitor per query topic. For apartment-finder, one is enough:

```
Settings:
  query: "New 3-bedroom apartment rental listings in San Francisco under $7500/month
          within 3 miles of the Caltrain 4th & King station, posted in the last 48 hours,
          with a real street address."
  frequency: "1h"
  processor: "core"     # lite is too noisy for actionable alerts
  webhook.url: https://<your-vercel-domain>/api/parallel/webhook
  webhook.event_types: ["monitor.event.detected"]
```

Management script `scripts/monitors.ts`:
- `monitors.ts list` → call `GET /v1/monitors`
- `monitors.ts create` → idempotent (check `metadata.external_id == "apartment-finder-prod"` before creating)
- `monitors.ts cancel` → `POST /v1/monitors/{id}/cancel`

### 2.4 Cron retirement plan

1. Ship Phase 2 with cron *also* running, both writing to the same `listings` table. Tag rows with `source_path = "cron" | "monitor"`.
2. After 7 days, compare new-row counts. If Monitor recall ≥ 80% of cron's, disable the cron in `setup_cron.sh` (don't delete — gives you a fallback).
3. After 30 days of stable Monitor operation, delete `setup_cron.sh`, `setup_monitor.sh`, and the four `fetch_*` functions in `apartment_indexer.py`. The Python project becomes optional / archived.

### 2.5 Email notifications

Resend stays. Move it from `apartment_indexer.py::send_email_notifications()` to a TS port in the web repo, called inline from the webhook handler whenever the new listing scores ≥ `SCORE_THRESHOLD`.

### Phase 2 deliverable

🟢 Cron disabled; web app receives Parallel webhooks and writes to DB. Latency from real-world listing → user inbox drops from "up to 30 min" to "near-real-time within Monitor cadence".

---

## Phase 3 — FindAll as a third discovery source

**Goal:** surface listings that keyword-search misses (building websites, agent posts, niche platforms).

**When:** after Phase 2 stable. Lower urgency.

### 3.1 What

A separate weekly job that calls FindAll with `generator: "core"` (not preview):

```json
{
  "objective": "...same as Monitor query, broader date range...",
  "entity_type": "apartment rental listings",
  "match_conditions": [...],
  "enrichments": [...],   // street_address, monthly_rent_usd, etc.
  "generator": "core",
  "match_limit": 50,
  "exclude_list": [
    // pre-populate from existing listings.url to avoid re-paying for dupes
  ]
}
```

Run weekly. For each new candidate, run the Phase-1 pipeline (Extract → Task) to enrich + spam-score before insert.

### 3.2 Where

Either:
- New cron in the web repo using Vercel Cron (`vercel.json` cron entry) → calls a `/api/findall/run` route handler
- Or as part of the `monitors.ts` management script, run manually

### 3.3 Caveats from the eval

- Don't trust FindAll's match conditions for `near_caltrain_4th_king` or `currently_active`. Strip those from `match_conditions` and verify post-hoc in our own code (haversine for distance, Extract result for active state).

### Phase 3 deliverable

🟡 FindAll feeds new candidates into the same enrichment path; behind a feature flag for first 2 weeks.

---

## Phase 4 — Deep Research overlay (optional)

**Goal:** for the ≤10 listings the user actually shortlists, surface landlord/building reputation.

### 4.1 Trigger

When a listing scores ≥ 70 and is shown on the front-end card.

### 4.2 Schema change

New table `listing_research`:

```sql
CREATE TABLE listing_research (
    listing_id TEXT REFERENCES listings(id),
    research_type TEXT,                    -- 'landlord' | 'building'
    findings JSONB,                        -- structured output
    citations JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (listing_id, research_type)
);
```

### 4.3 Trigger logic

Background task (Vercel Cron 1×/day): pick up to 20 listings with `score >= 70 AND id NOT IN listing_research`. For each, run Task with `processor: "ultra"` and questions like:
- "Has this address appeared in San Francisco housing court filings or Department of Building Inspection complaints in the last 5 years?"
- "What do prior tenants say about this building or landlord on Yelp, Google, or rental review sites?"

### 4.4 Front-end

Add a "Research" disclosure on the listing card: 🟢/🟡/🔴 indicator + "View signals" link that opens the structured findings.

### Phase 4 deliverable

⏸ Deferred unless Phase 1+2 prove out cost economics. Higher-tier processor → ~$/listing.

---

## Cross-cutting

### Environment variables

| Var | Where | Phase |
|---|---|---|
| `PARALLEL_API_KEY` | indexer + web | 1 |
| `PARALLEL_WEBHOOK_SECRET` | web only | 2 |
| `POSTGRES_URL` | indexer + web | (existing) |
| `RESEND_API_KEY`, `NOTIFY_EMAIL` | web (after move) | 2 |

### Cost guardrails

Add a daily Parallel-spend alert. Until billing dashboard supports it natively, log every Task `run_id` to a `parallel_calls` table and alarm via a Vercel Cron query that pages if daily count > N.

### Rollback strategy

- **Phase 1:** revert is a single git revert; regex code is gone but the listings already in DB are untouched. Worst case re-checkout the deleted regex, ship it back.
- **Phase 2:** cron remains in repo (just not registered). `crontab -e` add the indexer line back. ~5 min recovery.
- **Phase 3+4:** behind flags; flip off.

### What we are NOT changing

- **RentCast.** Cheap, structured, complementary. Leave it as the primary "trustable" source.
- **The Postgres schema.** All four phases use the existing `listings` table (Phase 4 adds one new table).
- **The frontend UI.** It already reads from the same table; no UI changes needed in Phase 1–3.

### Verification gates

Before merging each phase:

1. **Phase 1:** ≥80% agreement between old `score_spam()` and new `score_spam_with_task()` on a hand-labeled set of 50 listings (25 known-spam, 25 known-clean).
2. **Phase 2:** Monitor delivers ≥80% of the listings the cron would find over a 7-day window.
3. **Phase 3:** FindAll surfaces ≥1 new unique listing/week not seen by Search.
4. **Phase 4:** Deep Research catches at least one previously-published bad-landlord case in spot checks.

---

## Open questions to resolve before Phase 1

1. **Processor tier:** start with `base` for field extraction, `core` for spam? Or `core` for both? Cost vs. quality call.
2. **Webhook hosting:** Vercel route handler or a separate worker? Vercel works for the volume implied.
3. **Existing dead listings:** do we run a one-time pass over current `listings` rows with `is_active=TRUE` to mark dead Craigslist URLs as inactive? (Recommend yes — small Extract batch.)
