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
    # Major aggregators
    "zillow.com,apartments.com,trulia.com,craigslist.org,hotpads.com,rent.com,"
    "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com,"
    "rentberry.com,showcase.com,compass.com,rentsfnow.com,"
    # Listing-adjacent
    "homes.mercurynews.com,yelp.com"
)

GEO_COUNTRY = os.environ.get("GEO_COUNTRY", "us")
GEO_LAT_MIN = float(os.environ.get("GEO_LAT_MIN", "37.5"))
GEO_LAT_MAX = float(os.environ.get("GEO_LAT_MAX", "38.0"))
GEO_LNG_MIN = float(os.environ.get("GEO_LNG_MIN", "-122.6"))
GEO_LNG_MAX = float(os.environ.get("GEO_LNG_MAX", "-122.3"))

APP_TITLE = os.environ.get("APP_TITLE", f"{CITY_SHORT} Apartment Finder")
