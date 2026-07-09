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

DEFAULT_BUDGET = int(os.environ.get("SEARCH_BUDGET", "5000"))
DEFAULT_QUERY = os.environ.get("SEARCH_QUERY", f"apartments for rent in {CITY_SHORT}")

LISTING_SITES = os.environ.get(
    "LISTING_SITES",
    "trulia.com,craigslist.org,hotpads.com,rent.com,"
    "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com,"
    "rentberry.com,showcase.com,compass.com"
)

BLOCKED_DOMAINS = tuple(
    d.strip().lower() for d in os.environ.get(
        "BLOCKED_DOMAINS",
        "zillow.com,apartments.com,yelp.com",
    ).split(",") if d.strip()
)

GEO_COUNTRY = os.environ.get("GEO_COUNTRY", "us")

APP_TITLE = os.environ.get("APP_TITLE", "Apartment Finder")

BRAND_NAME = os.environ.get("BRAND_NAME", "Parallel")
BRAND_TAGLINE = os.environ.get("BRAND_TAGLINE", "AI Apartment Search")
BRAND_LOGO_URL = os.environ.get("BRAND_LOGO_URL", "/parallel-logo.svg")
BRAND_DISCLAIMER = os.environ.get(
    "BRAND_DISCLAIMER",
    "Powered by Parallel Web Systems · parallel.ai",
)

SUGGESTIONS = [s.strip() for s in os.environ.get(
    "SEARCH_SUGGESTIONS",
    "3-bedroom near transit, available within a month|"
    "Pet-friendly studio, available soon, under $2500|"
    "2BR with in-unit laundry and parking|"
    "Furnished 1BR, dog-friendly, short-term lease",
).split("|") if s.strip()]

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
    "RENT_FLOORS", "0:800,1:1000,2:1200,3:1500,4:2000,5:2500",
))

AGGREGATOR_SOURCES = [s.strip() for s in os.environ.get(
    "AGGREGATOR_SOURCES",
    "trulia,hotpads,padmapper,rentcafe,rent,showcase",
).split(",") if s.strip()]

STALE_AGGREGATOR_DAYS = int(os.environ.get("STALE_AGGREGATOR_DAYS", "14"))
STALE_DIRECT_DAYS = int(os.environ.get("STALE_DIRECT_DAYS", "45"))

# "base" is dramatically faster than "pro" (~1 min vs 5+ min) and plenty
# accurate for an interactive search. Override with FINDALL_GENERATOR=pro
# for exhaustive runs.
FINDALL_GENERATOR = os.environ.get("FINDALL_GENERATOR", "base")
FINDALL_MATCH_LIMIT = int(os.environ.get("FINDALL_MATCH_LIMIT", "8"))
# Processor for the structured-enrichment pass that fills in price, beds,
# address, etc. after discovery.
FINDALL_ENRICH_PROCESSOR = os.environ.get("FINDALL_ENRICH_PROCESSOR", "base")
