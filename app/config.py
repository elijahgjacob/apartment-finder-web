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
    # Major aggregators (zillow.com + apartments.com are blocked — see BLOCKED_DOMAINS)
    "trulia.com,craigslist.org,hotpads.com,rent.com,"
    "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com,"
    "rentberry.com,showcase.com,compass.com,rentsfnow.com,"
    # Listing-adjacent
    "homes.mercurynews.com,yelp.com"
)

# Domains we explicitly do NOT want in results (stale-prone, walled garden,
# or otherwise low-signal). Excluded at FindAll match-condition time, in
# the Monitor query, AND as a defensive insert-time guard.
BLOCKED_DOMAINS = tuple(
    d.strip().lower() for d in os.environ.get(
        "BLOCKED_DOMAINS",
        "zillow.com,apartments.com",
    ).split(",") if d.strip()
)

GEO_COUNTRY = os.environ.get("GEO_COUNTRY", "us")
GEO_LAT_MIN = float(os.environ.get("GEO_LAT_MIN", "37.5"))
GEO_LAT_MAX = float(os.environ.get("GEO_LAT_MAX", "38.0"))
GEO_LNG_MIN = float(os.environ.get("GEO_LNG_MIN", "-122.6"))
GEO_LNG_MAX = float(os.environ.get("GEO_LNG_MAX", "-122.3"))

APP_TITLE = os.environ.get("APP_TITLE", f"{CITY_SHORT} Apartment Finder")

# Monitor API. The background loop is now driven by Parallel Monitor —
# the FindAll polling cron is gone. Frequency accepts 1h / 6h / 1d / 1w / 30d.
MONITOR_FREQUENCY = os.environ.get("MONITOR_FREQUENCY", "1h")
# Monitor only supports 'lite' or 'base' processors per the Parallel API.
# 'base' is the better tier of the two — full Task tiers are available
# in the Task and FindAll calls below.
MONITOR_PROCESSOR = os.environ.get("MONITOR_PROCESSOR", "base")
MONITOR_POLL_SECONDS = int(os.environ.get("MONITOR_POLL_SECONDS", "60"))
MONITOR_INCLUDE_BACKFILL = os.environ.get("MONITOR_INCLUDE_BACKFILL", "true").lower() == "true"

# Task API processor for per-listing spam classification (5 boolean fields).
# Used in app/tasks.py::_score_spam.
TASK_SPAM_PROCESSOR = os.environ.get("TASK_SPAM_PROCESSOR", "core")

# FindAll generator for the user-driven discovery search. 'core' is the
# accuracy tier; 'preview' is the cheap-and-fast iteration variant.
FINDALL_GENERATOR = os.environ.get("FINDALL_GENERATOR", "core")
