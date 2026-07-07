from __future__ import annotations

import os

CITY = os.environ.get("CITY", "San Francisco, CA")
CITY_SHORT = os.environ.get("CITY_SHORT", CITY.split(",")[0].strip())

REFERENCE_POINT_NAME = os.environ.get("REFERENCE_POINT_NAME", "Caltrain · 4th & King")
REFERENCE_POINT_LAT = float(os.environ.get("REFERENCE_POINT_LAT", "37.7764"))
REFERENCE_POINT_LNG = float(os.environ.get("REFERENCE_POINT_LNG", "-122.3973"))

MAP_CENTER_LAT = float(os.environ.get("MAP_CENTER_LAT", str(REFERENCE_POINT_LAT)))
MAP_CENTER_LNG = float(os.environ.get("MAP_CENTER_LNG", str(REFERENCE_POINT_LNG)))
MAP_ZOOM = int(os.environ.get("MAP_ZOOM", "13"))

DEFAULT_BUDGET = int(os.environ.get("SEARCH_BUDGET", "7500"))
DEFAULT_QUERY = os.environ.get("SEARCH_QUERY", f"apartments for rent in {CITY_SHORT}")
SEARCH_INTERVAL = int(os.environ.get("SEARCH_INTERVAL_SECONDS", "300"))
SEARCH_BEDROOMS = os.environ.get("SEARCH_BEDROOMS", "")

SPAM_HIDE_THRESHOLD = int(os.environ.get("SPAM_HIDE_THRESHOLD", "50"))

LISTING_SITES = os.environ.get(
    "LISTING_SITES",
    # Major aggregators (zillow / apartments.com / yelp.com are blocked — see BLOCKED_DOMAINS)
    "trulia.com,craigslist.org,hotpads.com,rent.com,"
    "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com,"
    "rentberry.com,showcase.com,compass.com,rentsfnow.com,"
    # Listing-adjacent
    "homes.mercurynews.com"
)

# Domains we explicitly do NOT want in results (stale-prone, walled garden,
# or otherwise low-signal). Excluded at FindAll match-condition time, in
# the Monitor query, AND as a defensive insert-time guard.
BLOCKED_DOMAINS = tuple(
    d.strip().lower() for d in os.environ.get(
        "BLOCKED_DOMAINS",
        "zillow.com,apartments.com,yelp.com",
    ).split(",") if d.strip()
)

GEO_COUNTRY = os.environ.get("GEO_COUNTRY", "us")
GEO_LAT_MIN = float(os.environ.get("GEO_LAT_MIN", "37.5"))
GEO_LAT_MAX = float(os.environ.get("GEO_LAT_MAX", "38.0"))
GEO_LNG_MIN = float(os.environ.get("GEO_LNG_MIN", "-122.6"))
GEO_LNG_MAX = float(os.environ.get("GEO_LNG_MAX", "-122.3"))

APP_TITLE = os.environ.get("APP_TITLE", f"{CITY_SHORT} Apartment Finder")

# ── Brand / theming (env-driven so deployment can re-skin) ──────────────

BRAND_NAME = os.environ.get("BRAND_NAME", "Parallel")
BRAND_TAGLINE = os.environ.get("BRAND_TAGLINE", "AI Apartment Search")
# Path to a logo image served from the frontend's public dir, or an
# absolute URL. Leave empty to render text-only mark.
BRAND_LOGO_URL = os.environ.get("BRAND_LOGO_URL", "/parallel-logo.svg")
BRAND_DISCLAIMER = os.environ.get(
    "BRAND_DISCLAIMER",
    "Powered by Parallel Web Systems · parallel.ai",
)

# Suggestion chips shown under the search bar. Pipe-separated so commas
# can appear inside individual queries.
SUGGESTIONS = [s.strip() for s in os.environ.get(
    "SEARCH_SUGGESTIONS",
    f"{SEARCH_BEDROOMS or '3'}-bedroom near transit, available within a month, under ${DEFAULT_BUDGET}|"
    f"Pet-friendly studio in {CITY_SHORT}, available before December, under $3000|"
    f"3BR with in-unit laundry and parking, walk to {REFERENCE_POINT_NAME}, under $7000|"
    "Furnished 1BR for a 6-month lease, dog-friendly, under $4000",
).split("|") if s.strip()]

# Per-bedroom realistic monthly-rent floors for the current market.
# Format: "0:1900,1:2700,2:3600,3:5200,4:6500,5:8000". Used both for the
# 'budget too low' warning and for the stale-cheap parse-miscue rejection.
def _parse_rent_floors(raw: str) -> dict[int, int]:
    out: dict[int, int] = {}
    for pair in raw.split(","):
        if ":" not in pair:
            continue
        k, v = pair.split(":", 1)
        try:
            out[int(k.strip())] = int(v.strip())
        except ValueError:
            continue
    return out

RENT_FLOORS = _parse_rent_floors(os.environ.get(
    "RENT_FLOORS", "0:1900,1:2700,2:3600,3:5200,4:6500,5:8000",
))

# Sources where listings stay live in the index after the unit is rented.
# Comma-separated; values are the short source labels we derive from URLs.
AGGREGATOR_SOURCES = [s.strip() for s in os.environ.get(
    "AGGREGATOR_SOURCES",
    "trulia,hotpads,padmapper,rentcafe,rent,showcase",
).split(",") if s.strip()]

STALE_AGGREGATOR_DAYS = int(os.environ.get("STALE_AGGREGATOR_DAYS", "14"))
STALE_DIRECT_DAYS = int(os.environ.get("STALE_DIRECT_DAYS", "45"))

# Monitor API. The background loop is now driven by Parallel Monitor —
# the FindAll polling cron is gone. Frequency accepts 1h / 6h / 1d / 1w / 30d.
MONITOR_FREQUENCY = os.environ.get("MONITOR_FREQUENCY", "1h")
# Monitor only supports 'lite' or 'base' processors per the Parallel API
# (we tried 'core' / 'pro' and the API returns 422). 'base' is the
# best tier the product accepts. Full Task tiers below are unconstrained.
MONITOR_PROCESSOR = os.environ.get("MONITOR_PROCESSOR", "base")
MONITOR_POLL_SECONDS = int(os.environ.get("MONITOR_POLL_SECONDS", "60"))
MONITOR_INCLUDE_BACKFILL = os.environ.get("MONITOR_INCLUDE_BACKFILL", "true").lower() == "true"

# Task API processor for per-listing spam classification (5 boolean fields).
# 'pro' for deeper reasoning per the cookbook; the user has unlimited spend.
TASK_SPAM_PROCESSOR = os.environ.get("TASK_SPAM_PROCESSOR", "pro")

# FindAll generator for the user-driven discovery search.
# 'pro' is the highest-quality tier (slower, more thorough). 'core' is
# the standard production tier; 'preview' is the cheap-and-fast iteration
# variant. The user has unlimited spend so we default to pro.
FINDALL_GENERATOR = os.environ.get("FINDALL_GENERATOR", "pro")
