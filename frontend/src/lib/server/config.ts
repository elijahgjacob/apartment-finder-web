// Server-side configuration (Next.js API routes). Ported from the FastAPI
// backend's config.py — every value is env-overridable, same names.

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}
function envNum(key: string, fallback: number): number {
  const v = process.env[key]
  const n = v != null ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export const CITY = envStr("CITY", "San Francisco, CA")
export const CITY_SHORT = envStr("CITY_SHORT", CITY.split(",")[0].trim())

export const REFERENCE_POINT_NAME = envStr("REFERENCE_POINT_NAME", "Caltrain · 4th & King")
export const REFERENCE_POINT_LAT = envNum("REFERENCE_POINT_LAT", 37.7764)
export const REFERENCE_POINT_LNG = envNum("REFERENCE_POINT_LNG", -122.3973)

export const MAP_CENTER_LAT = envNum("MAP_CENTER_LAT", REFERENCE_POINT_LAT)
export const MAP_CENTER_LNG = envNum("MAP_CENTER_LNG", REFERENCE_POINT_LNG)
export const MAP_ZOOM = envNum("MAP_ZOOM", 13)

export const DEFAULT_BUDGET = envNum("SEARCH_BUDGET", 5000)
export const DEFAULT_QUERY = envStr("SEARCH_QUERY", `apartments for rent in ${CITY_SHORT}`)

export const LISTING_SITES = envStr(
  "LISTING_SITES",
  "trulia.com,craigslist.org,hotpads.com,rent.com," +
  "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com," +
  "rentberry.com,showcase.com,compass.com",
)

export const BLOCKED_DOMAINS = envStr("BLOCKED_DOMAINS", "zillow.com,apartments.com,yelp.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)

export const GEO_COUNTRY = envStr("GEO_COUNTRY", "us")

export const APP_TITLE = envStr("APP_TITLE", "Apartment Finder")
export const BRAND_NAME = envStr("BRAND_NAME", "Apartment Finder")
export const BRAND_TAGLINE = envStr("BRAND_TAGLINE", "AI Apartment Search")
export const BRAND_LOGO_URL = envStr("BRAND_LOGO_URL", "/app-logo.svg")
export const BRAND_DISCLAIMER = envStr(
  "BRAND_DISCLAIMER", "Powered by Parallel Web Systems · parallel.ai",
)

export const SUGGESTIONS = envStr(
  "SEARCH_SUGGESTIONS",
  "3-bedroom near transit, available within a month|" +
  "Pet-friendly studio, available soon, under $2500|" +
  "2BR with in-unit laundry and parking|" +
  "Furnished 1BR, dog-friendly, short-term lease",
).split("|").map((s) => s.trim()).filter(Boolean)

// Typical monthly-rent floors by bedroom count for the default city (SF).
// Drives the auto-budget when a query omits one, and the price-fit score.
export const RENT_FLOORS: Record<number, number> = (() => {
  const out: Record<number, number> = {}
  for (const pair of envStr("RENT_FLOORS", "0:1900,1:2700,2:3600,3:5200,4:6500,5:8000").split(",")) {
    const [k, v] = pair.split(":")
    const kn = parseInt(k?.trim() ?? "", 10)
    const vn = parseInt(v?.trim() ?? "", 10)
    if (Number.isFinite(kn) && Number.isFinite(vn)) out[kn] = vn
  }
  return out
})()

export const AGGREGATOR_SOURCES = envStr(
  "AGGREGATOR_SOURCES", "trulia,hotpads,padmapper,rentcafe,rent,showcase",
).split(",").map((s) => s.trim()).filter(Boolean)

export const STALE_AGGREGATOR_DAYS = envNum("STALE_AGGREGATOR_DAYS", 14)
export const STALE_DIRECT_DAYS = envNum("STALE_DIRECT_DAYS", 45)

// "base" is dramatically faster than "pro" (~1 min vs 5+) and plenty accurate
// for an interactive search.
export const FINDALL_GENERATOR = envStr("FINDALL_GENERATOR", "base")
export const FINDALL_MATCH_LIMIT = envNum("FINDALL_MATCH_LIMIT", 8)
export const FINDALL_ENRICH_PROCESSOR = envStr("FINDALL_ENRICH_PROCESSOR", "base")
