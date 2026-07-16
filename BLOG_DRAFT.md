<!--
DRAFT for the Parallel developers blog. This is a starting point, not a finished
post. It needs a pass in your own voice before publishing. Everything below is
grounded in the actual app code and verified against docs.parallel.ai
(FindAll V1 + Task API). No em dashes per house style. Live demo:
https://apartment-finder-web.vercel.app  Code: (repo link)
-->

# Finding an apartment is a discovery problem, not a search box

I needed a place in the Bay Area, and the usual sites all have the same problem: you filter, you scroll, you open ten tabs, and half the listings are stale, duplicated across aggregators, or not actually a place you can rent. What I wanted was simpler. Describe the apartment in plain language, and get back a short list of real, openable listings that already match.

That turns out to be a discovery problem, not a search problem. A search box matches keywords. Discovery means going out to the open web, evaluating each candidate against what I asked for, and only keeping the ones that pass. That is exactly what Parallel's FindAll API does, so I built the whole app on top of it. Here is how it works and what I learned.

Live demo: https://apartment-finder-web.vercel.app

## One FindAll call does the hard part

The user types something like "2 bedroom in the Mission under $4,600, in-unit laundry." The app turns that into a single FindAll run. The interesting part is that I do not hand FindAll a keyword query. I hand it an objective and a set of match conditions, and it discovers candidates and checks each one for me.

```json
POST https://api.parallel.ai/v1beta/findall/runs
{
  "objective": "Find 2 bedroom apartments for rent under 4600 dollars per month in San Francisco, CA. 2 bedroom in the Mission",
  "entity_type": "apartment rental listings",
  "match_conditions": [
    {
      "name": "is_rental_listing",
      "description": "The page is ONE individual rental unit's listing, showing that specific unit's own street address. Do NOT match search-results pages, category/index pages, or building-overview pages."
    },
    {
      "name": "fits_budget",
      "description": "The asking monthly rent is at or below $4600. If the rent is not shown, treat this as matched."
    }
  ],
  "enrichments": [
    { "name": "street_address", "description": "The exact street address as written on the page..." },
    { "name": "monthly_rent_usd", "description": "The listed monthly rent as an integer in USD..." },
    { "name": "bedrooms", "description": "The bedroom count of the unit (0 for studio)..." }
    // ...14 more: bathrooms, sqft, available_date, pet_policy, parking, laundry, etc.
  ],
  "generator": "base",
  "match_limit": 10
}
```

The distinction that made everything click for me is **match conditions vs enrichments**:

- **Match conditions** decide whether a candidate is kept. They are boolean. "Is this an individual listing page?" "Is the rent under budget?" FindAll returns both the value and an `is_matched` flag for each.
- **Enrichments** are the structured fields I want back for the matches I keep: rent, beds, address, square footage, pet policy, and 13 others. They do not affect matching. Under the hood they run on Parallel's Task API, one task per matched candidate.

So a match condition is "only real listings under budget," and an enrichment is "and for each one, pull me these 18 fields." I never write a scraper or a parser.

## The app is a stateless client driving the run

FindAll runs are asynchronous. The app is a single Next.js project deployed on Vercel, and there is no backend server holding state. The browser drives each search through short serverless calls:

```
create run  ->  poll status  ->  kick enrichment  ->  poll  ->  finalize (geocode + score)
```

`POST /api/search` creates the run and returns a `findall_id`. The client polls `GET /v1beta/findall/runs/{id}` for status and matched candidates, then calls `/enrich` to run the Task-powered enrichment pass, polls again, and finally geocodes and scores everything for the map and the ranked list. Every step is a fast serverless invocation. The only thing that persists is the user's saved shortlist, and that lives in their own browser via localStorage.

## What "verified" does not mean

Here is the lesson that cost me the most time. FindAll verifying a candidate means "this page matches your conditions." It does not automatically mean "this is a link a human can click and rent from." Those are different bars, and the gap between them is where a real product lives.

The candidates that passed matching but were useless to a renter fell into a few buckets:

- **Category and search pages.** A page listing 40 units in a neighborhood technically "describes rentals," but you cannot rent it. I tightened the match condition to explicitly reject index and building-overview pages, and I added a URL filter that recognizes search or category paths.
- **Aggregators with dead outbound links.** Some large aggregators bot-wall the actual listing, so the link looks fine and then dies. I block a small set of those hosts rather than send someone to a wall.
- **The wrong link when several are cited.** A candidate sometimes carries several URLs, and the first one is a browse page while a deeper one is the actual unit. I score every candidate URL by specificity and pick the most specific individual listing.

None of this is FindAll's job. FindAll gave me matches with citations. Turning matches into openable listings was the application layer, and it is most of what separates a demo from something you would actually use.

## Discovery is variable, so plan for thin runs

A thin query, say a small neighborhood with little inventory, sometimes comes back with a candidate set that is mostly category pages and no-address entries. Early on, one unlucky run could finalize with zero listings even though the same query a minute later returned six.

Two fixes:

- **Escape a stuck discovery.** FindAll reports `completed` when it fills `match_limit` or exhausts the web. A rare query may never fill the limit, so instead of waiting forever I proceed to enrichment once discovery has run long enough with at least one match.
- **Retry a genuinely thin run once.** If a run that actually completed still finalizes with almost nothing, I run one more fresh pass and keep whichever surfaced more. I do not retry a run that bailed out early, because an over-constrained query is legitimately near-empty and a second identical pass just doubles latency.

## Latency and recall are a dial, not a default

Discovery plus per-listing enrichment is inherently a multi-minute operation, and it is worth being honest with users about that (I show a live timer and stream results in as they verify). The knobs that matter:

- **Generator tier.** `base` is the cheapest and fastest for a broad query with many expected matches; `core` and `pro` search harder for rarer, more specific ones. For "apartments in a city," `base` is the right call.
- **`match_limit`.** The accessibility gate drops a real fraction of "verified" candidates, so I ask for more than I need as headroom.
- **Not blocking on every enrichment.** Enrichment ripens gradually. The client finalizes with what is ready once enrichment settles, rather than waiting on a single slow straggler.

## A second, targeted check with the Task API

FindAll is the discovery engine. For one specific job, a fraud check on listings from untrusted sources, I use the Task API directly. It is the same API that powers FindAll's enrichments, just called on its own with a fact-based schema:

```json
POST https://api.parallel.ai/v1/tasks/runs
{
  "input": { "title": "...", "body": "...", "price": 2200, "address": "...", "source": "craigslist.org" },
  "task_spec": { "output_schema": { "type": "json", "json_schema": { /* 5 fact-based scam signals */ } } },
  "processor": "base"
}
```

The schema asks for concrete signals (off-platform payment, owner claims to be abroad, address withheld, no viewings offered, unusual move-in incentives) rather than a vague "is this a scam" score. Fact-based booleans that I weight in code are far more reliable than asking a model for a subjective verdict, which is a pattern Parallel's own cookbook recommends and which I leaned on throughout: standardized empty-string sentinels for missing data, `required` plus `additionalProperties: false` on every schema, and an Entity to Action to Specifics to Error structure for each of the 18 enrichment descriptions.

## What I did and did not have to build

Parallel handled the parts that would otherwise have been the whole project: crawling the open web, evaluating each candidate against my criteria with citations, and extracting 18 structured fields per match. I did not write a scraper, a parser, or a ranking model for relevance.

What I built on top was the product layer: turning verified matches into openable listings, handling discovery variance, tuning the latency and recall dial, geocoding and scoring for the map, and the fraud check. That split, Parallel for discovery and verification and a thin app for the experience, is why one person could build this in a couple of weeks.

Code: (repo link). Live demo: https://apartment-finder-web.vercel.app
