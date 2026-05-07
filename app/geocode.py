from __future__ import annotations

import time
import urllib.parse
import urllib.request
import json

from .config import CITY, GEO_COUNTRY, GEO_LAT_MIN, GEO_LAT_MAX, GEO_LNG_MIN, GEO_LNG_MAX

_last_request_time = 0.0
_MIN_INTERVAL = 1.1


def _clean_address(address: str) -> str:
    """Strip prefixes/suffixes that confuse geocoders."""
    import re
    cleaned = re.sub(r"^\d+BR,?\s*", "", address)
    cleaned = re.sub(r"\s*-\s*\$[\d,]+/month$", "", cleaned)
    cleaned = re.sub(r",?\s*\$[\d,]+/month$", "", cleaned)
    cleaned = re.sub(r"\s*-\s*Apartments?\.?.*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Apt\.?\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Unit\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+Suite\s+[\w-]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+#\s*[\w-]+", "", cleaned)
    cleaned = re.sub(r"\s+Apartments?,?\s*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip().rstrip(",").strip()
    return cleaned


def _query_nominatim(query: str) -> tuple[float, float] | None:
    global _last_request_time

    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)

    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": "1",
        "countrycodes": GEO_COUNTRY,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"

    req = urllib.request.Request(url, headers={
        "User-Agent": "ApartmentFinder/1.0 (apartment search app)",
    })

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            _last_request_time = time.time()
            data = json.loads(resp.read().decode())
            if data:
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                if GEO_LAT_MIN < lat < GEO_LAT_MAX and GEO_LNG_MIN < lon < GEO_LNG_MAX:
                    return (lat, lon)
    except Exception:
        pass

    return None


def geocode_address(address: str, city: str = CITY) -> tuple[float, float] | None:
    """Geocode an address using OSM Nominatim. Returns (lat, lng) or None."""
    import re

    address = _clean_address(address)
    if not address or len(address) < 4:
        return None

    query = address
    if city.lower() not in address.lower():
        query = f"{address}, {city}"

    result = _query_nominatim(query)
    if result:
        return result

    simplified = re.sub(
        r"\s+(St|Ave|Blvd|Dr|Rd|Ct|Way|Ln|Pl|Street|Avenue|Boulevard|Drive|Road|Court|Place|Lane)\.?\b",
        "", address, flags=re.IGNORECASE
    )
    if simplified != address:
        fallback_query = f"{simplified}, {city}" if city.lower() not in simplified.lower() else simplified
        result = _query_nominatim(fallback_query)
        if result:
            return result

    return None
