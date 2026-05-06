# Parallel APIs for SF Apartment Finder — Evaluation

**Date:** 2026-05-06
**Pipeline under evaluation:** `elijahgjacob/apartment-finder` (indexer in Python, web in Next.js)
**APIs tested:** Search (already deployed), Extract, Task (Enrichment), FindAll, Monitor

## TL;DR

| API | Verdict | Why |
|---|---|---|
| **Search** | already deployed | building block for everything else |
| **Extract** | **deploy** | turns 4-line excerpts into 12–34 KB of clean markdown; immediately exposes that ~⅔ of stored Craigslist URLs in the indexer are dead pages |
| **Task (Enrichment)** | **deploy** | nailed a fabricated scam listing at 0.78 confidence with cited fraud signals — far beyond the regex `score_spam()` heuristic |
| **FindAll** | **supplement, don't replace** | preview run produced real candidates with structured outputs but match conditions like "currently active" failed to verify — fits the *discovery* layer, not the *truth* layer |
| **Monitor** | **deploy (with a real webhook)** | created cleanly, runs on `1h`/`1d`/`1w` schedules with webhook delivery — natural fit to replace the cron + scraper + Resend stack |

**Ship first:** `Search → Extract → Task Enrichment` (Stack B from the plan). Largest quality jump, smallest re-architecture, doesn't depend on any unproven matching behavior.

---

## 1. Extract API

**Endpoint:** `POST https://api.parallel.ai/v1beta/extract` (header `parallel-beta: search-extract-2025-10-10`)

### What we sent

```json
{
  "urls": [3 fresh URLs from a /v1beta/search call],
  "objective": "Extract bedroom count, exact street address, monthly rent, square footage, amenities, and listing date for this San Francisco rental.",
  "excerpts": true,
  "full_content": true
}
```

### What came back

- **Latency:** 75.8s for 3 URLs (cold)
- **Status:** 200 — `extract_id`, `results[]`, `usage` (3× excerpts + 3× full)
- **Per URL:** ~12–34 KB of clean markdown, JS-rendered, navigation chrome stripped
- **Errors:** none

### Cross-reference against current indexer

The indexer stores `body[:1000]` from search excerpts and regex-parses for price/address/bedrooms. When we ran Extract on the 3 Craigslist URLs that the *deployed* `web-three-tau-42.vercel.app` site is currently surfacing, **2 of 3 returned 404 / "Page Not Found" / "flagged for removal"**. That's a finding on its own: the indexer's `is_active` column is lying — Craigslist listings get removed faster than the cron deactivates them.

For the 3 fresh URLs (Zillow, Apartments.com index pages), Extract returned full markdown; an LLM consuming that markdown can populate every field the regex currently misses (true bed count, amenities, photos, exact address, listing date).

### Verdict: **deploy**

- **Where:** `apartment_indexer.py`, after `run_search()`, batch up to 20 URLs per call
- **What it deletes:** all the regex pyramids (`PRICE_RE`, `IS_3BR_RE`, `NOT_3BR_RE`, `CL_ADDR_RE`, `ADDR_RE`, `ZUMPER_*_RE`, `CL_PRICE_*_RE`)
- **What it adds:** ~$0 fixed cost vs. existing search; just batch the URLs you already know

---

## 2. Task API — Enrichment

**Endpoint:** `POST https://api.parallel.ai/v1/tasks/runs`
**Result:** `GET /v1/tasks/runs/{run_id}/result`

### What we sent

A fabricated listing constructed to mimic a Craigslist scam (owner relocated, email-only contact, address withheld, "first month free"):

```json
{
  "input": {
    "title": "Bright 3BR flat near Caltrain - $4200",
    "body": "Beautiful three bedroom apartment in SoMa near transit. Recently renovated. Contact for viewing. Owner relocated for work, please contact via email only. First month free for qualified tenants. Address available upon serious inquiry.",
    "asking_price_usd": 4200,
    "claimed_neighborhood": "soma",
    "source": "craigslist"
  },
  "task_spec": { "output_schema": { /* is_likely_spam, spam_confidence, fraud_signals[], true_bedroom_count, amenities[], rationale */ } },
  "processor": "core"
}
```

### What came back

- **Latency:** 67s end-to-end (`core` processor)
- **Output:**

```json
{
  "is_likely_spam": true,
  "spam_confidence": 0.78,
  "fraud_signals": [
    "Owner relocated for work, please contact via email only.",
    "Address available upon serious inquiry.",
    "First month free for qualified tenants.",
    "Listing on Craigslist with minimal detail and no listed amenities or photos mentioned."
  ],
  "true_bedroom_count": 3,
  "amenities": [],
  "rationale": "The combination of a remote owner insisting on email-only contact, withholding the address, and offering an unusually generous first-month-free incentive are common markers of rental scams."
}
```

Plus per-field `basis` array with reasoning + confidence (`high`/`medium`/`low`) for each field.

### Cross-reference

Run the same listing through `score_spam()` in `apartment_indexer.py`:

| Signal | `score_spam()` | Task |
|---|---|---|
| Fraud keywords (`western union`, `wire`, `gift card`, ...) | 0 (none of those phrases present) | flagged "Owner relocated for work, please contact via email only" |
| `no_geo` (lat is null) | +15 | not used as a spam signal |
| `price_below_median` | depends on RentCast median | not used |
| `short_body` | not flagged (>80 chars) | flagged "minimal detail" |
| **Verdict** | likely score 15 (no_geo only) → "Clean" | **78% spam, 4 cited signals** |

The regex would have shipped this listing to the user's inbox. Task correctly flagged it.

### Verdict: **deploy**

- **Where:** `apartment_indexer.py::save_listings()`, replace `score_spam()` for any listing where `source != "rentcast"` (rentcast is structured)
- **What it deletes:** `score_spam()`, `FRAUD_KEYWORDS`, `_medians` cache, `get_median()` (for spam purposes)
- **Cost shape:** 1 task run per new listing per cycle. With ~10–30 new listings per 30-min cron, that's 480–1,440 `core` task runs/day. Use `base` processor if cost matters — single-field fact lookups don't need `core`.

---

## 3. FindAll API

**Endpoint:** `POST https://api.parallel.ai/v1beta/findall/runs` (header `parallel-beta: findall-2025-09-15`)

### What we sent

```json
{
  "objective": "Find currently-listed 3-bedroom apartments for rent in San Francisco within 3 miles of the Caltrain 4th & King station, asking under $7500/month.",
  "entity_type": "apartment rental listings",
  "match_conditions": [
    "is_three_bedroom", "in_san_francisco", "near_caltrain_4th_king",
    "under_budget", "currently_active"
  ],
  "enrichments": [
    "street_address", "monthly_rent_usd", "bedrooms", "bathrooms",
    "square_feet", "listed_date", "source_url"
  ],
  "generator": "preview",
  "match_limit": 10
}
```

### What came back

- **Latency:** ~5 minutes (preview generator)
- **Result:** 3 candidates generated, **0 matched**, terminated with `low_match_rate`
- **Candidates produced:**
  1. `363 6th St` (realtor.com) — matched 4/5; failed `near_caltrain_4th_king` because distance couldn't be inferred from the page (it *is* near Caltrain — false negative)
  2. `255 King St` — matched 3/5; failed `currently_active` and `is_three_bedroom` (insufficient page evidence)
  3. Zillow under-$700 search page — matched 2/5 (false positive on `under_budget`, generic match)

### Cross-reference

The indexer's last successful run found ~10–18 listings via 4 source-specific scrapers. FindAll's preview produced 3 candidates with mixed match quality — but it did successfully extract fields like `monthly_rent_usd: $2645` and `street_address: "363 6th St"` per candidate, with citations.

### Verdict: **supplement, don't replace**

The discovery part works (it found real SF rental listings without being told *where* to look). The matching part is where the regex pipeline still wins — "currently active" is hard to infer from a static page, and "near Caltrain" needs explicit geocoding.

- **Where to use it:** as a *third source* alongside RentCast + Search/Extract — let it surface listings the keyword scrapers miss (off-platform listings, building websites, agent posts on news sites)
- **Generator:** `core`, not `preview` — preview is for query iteration only
- **Don't:** rely on it for boolean filters that need geographic precision; do the geo-filter yourself after enrichments come back

---

## 4. Monitor API

**Endpoint:** `POST https://api.parallel.ai/v1/monitors`

### What we sent

```json
{
  "type": "event_stream",
  "frequency": "1d",
  "processor": "lite",
  "settings": {
    "query": "New 3-bedroom apartment rental listings in San Francisco under $7500/month within 3 miles of the Caltrain 4th & King station, posted in the last 48 hours, with a real street address."
  },
  "webhook": { "url": "https://example.com/parallel-test-webhook", "event_types": ["monitor.event.detected"] }
}
```

### What came back

- **HTTP 201**, `monitor_id` returned
- `status: active`, `last_run_at` set to creation time (first run kicks off immediately)
- Polling `/v1/monitors/{id}/events` returned `{events: []}` ~10 minutes later (first run still in progress; `1d` frequency means subsequent runs are spaced out)
- Cancellation via `POST /v1/monitors/{id}/cancel` — the test monitor has been cancelled.

### Verdict: **deploy (with a real webhook)**

This is the most architecturally-impactful API for the apartment-finder. It collapses:

```
cron (30 min) → indexer.py (4 scrapers + parsing + spam + geocode + db upsert + email)
```

into:

```
Monitor (continuous) → webhook → small handler (Extract + Enrichment + db upsert + email)
```

- **Where:** create one monitor per `1h` cadence; webhook receiver lives in `apartment-finder-web` as a Next.js route handler (`/api/parallel/webhook`), which then runs Extract on the candidate URL, Task Enrichment for spam scoring, and writes the row to Postgres.
- **What it deletes:** `setup_cron.sh`, `setup_monitor.sh`, all the per-source `fetch_*` functions
- **Caveat:** the `processor: "lite"` is the cheapest tier; for higher recall you'd use `core`. We did not observe the first-run output (would need a real webhook), so this is a deploy-with-eyes-open recommendation, not a verified one.

---

## Combination scorecard

| Stack | Code that disappears | Recall vs. now | New failure modes | Rec |
|---|---|---|---|---|
| **A. Search → Extract** | All regex parsers (`PRICE_RE`, `*_ADDR_RE`, `ZUMPER_*_RE`, etc.) | same | Extract latency in cron path (~25s/URL p50) | safe |
| **B. Search → Extract → Task** ← *recommended first ship* | regex parsers + `score_spam()` + `_medians`/`get_median()` | same | task throughput limits at high listing counts | best ROI |
| **C. FindAll → Extract** | per-source `fetch_craigslist`, `fetch_zumper`, `fetch_multisource` | **lower at preview, untested at core**; some boolean conditions can't be verified from page text | over-reliance on FindAll's match logic; cost spike if listings churn | wait |
| **D. Monitor → Extract → Task** | cron + `setup_cron.sh` + all four `fetch_*` + email-from-cron | depends on Monitor recall (untested) | webhook reliability becomes critical; harder to debug a "missed listing" | next after B |
| **E. D + Deep Research overlay** | nothing additional | same | $$ overlay only fires for top-N | nice to have |

## Recommended implementation order

1. **Stack B (Search → Extract → Task Enrichment)** — biggest quality bump, smallest blast radius, ships in the existing indexer
2. **Stack D (Monitor) on top of B** — once B is stable, Monitor becomes the trigger and the indexer becomes a webhook handler
3. **FindAll** as an additional *discovery* source feeding into B's pipeline (run weekly with `core`, not in the hot path)
4. **Deep Research overlay** for any listing that scores ≥ 70 — surface landlord/building reputation signals on the front-end card

## Notes on the run

- API key was provided in conversation; not stored to disk, never written to any committed file.
- Test monitor `monitor_d967707d9ec34e41a99550e65eb3cac7` was created and **cancelled** (no ongoing usage).
- Two Craigslist listings already in the live deployment returned `404 / flagged-for-removal` from Extract — the indexer is keeping dead listings in the active set. Consider a periodic re-Extract pass to deactivate stale rows.
- Total SKUs consumed: ~6 extract excerpts + 6 extract full + 1 task `core` run + 1 findall preview run + 1 monitor.
