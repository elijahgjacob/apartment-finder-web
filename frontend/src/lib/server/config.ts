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

export const DEFAULT_BUDGET = envNum("SEARCH_BUDGET", 6000)
export const DEFAULT_QUERY = envStr("SEARCH_QUERY", `apartments for rent in ${CITY_SHORT}`)

export const LISTING_SITES = envStr(
  "LISTING_SITES",
  "trulia.com,craigslist.org,hotpads.com,rent.com," +
  "redfin.com,realtor.com,padmapper.com,rentcafe.com,zumper.com,movoto.com," +
  "rentberry.com,showcase.com,compass.com",
)

// Domain-level blocks. Kept deliberately small: category/search index pages
// are filtered precisely by URL pattern (lib/listing-url), so we no longer
// blanket-block whole aggregators. apartments.com in particular has huge,
// extractable individual-listing inventory — blocking it was silently killing
// most Bay Area results. zillow (heavy bot-walls → dead outbound links),
// yelp (not rental listings), and loopnet/crexi (commercial real estate, not
// apartments) stay blocked.
export const BLOCKED_DOMAINS = envStr("BLOCKED_DOMAINS", "zillow.com,yelp.com,loopnet.com,crexi.com")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)

export const GEO_COUNTRY = envStr("GEO_COUNTRY", "us")

export const APP_TITLE = envStr("APP_TITLE", "Bay Area Apartment Finder")
export const BRAND_NAME = envStr("BRAND_NAME", "Apartment Finder")
export const BRAND_TAGLINE = envStr("BRAND_TAGLINE", "AI Apartment Search")
export const BRAND_LOGO_URL = envStr("BRAND_LOGO_URL", "/app-logo.svg")
export const BRAND_DISCLAIMER = envStr(
  "BRAND_DISCLAIMER", "Powered by Parallel Web Systems · parallel.ai",
)

export const SUGGESTIONS = envStr(
  "SEARCH_SUGGESTIONS",
  "2 bedroom in the Mission under $4,600|" +
  "1 bedroom near UC Berkeley under $3,000|" +
  "Studio in Palo Alto under $2,600|" +
  "2 bed 1,000 sq ft in Oakland under $3,500",
).split("|").map((s) => s.trim()).filter(Boolean)

// Typical monthly-rent floors by bedroom count for the default city (SF).
// Drives the auto-budget when a query omits one, and the price-fit score.
export const RENT_FLOORS: Record<string, number> = (() => {
  const out: Record<string, number> = {}
  for (const pair of envStr("RENT_FLOORS", "0:2500,1:3400,2:4600,3:6200,4:7800,5:9500").split(",")) {
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

// Latency vs. recall balance for an interactive search. Measured: enrichment
// dominates wall-clock — each per-listing Task is slow (core ~100s/listing,
// pro/ultra far worse), so the search must NOT block on enriching every match.
// - Discovery: fast "base" generator (finding candidate URLs is easy).
// - Enrichment: "core". Measured tradeoff — "base" is no faster to first
//   result but extracts poorly, so blank price/beds listings get filtered and
//   recall collapses; "core" reads pages reliably so the results we surface are
//   usable. pro/ultra are far slower for no recall gain here. The client caps
//   how long it waits on enrichment (see use-search) and finalizes with what's
//   ready, so core's slower tail doesn't stall the search.
// - match_limit: the accessibility gate drops a large share of "verified"
//   candidates (Zillow/blocked hosts, category/index pages, dupes), so ~6
//   matches yielded only ~2 shown. 10 gives more headroom for survivors —
//   more listings per search — at some added discovery/enrichment time.
export const FINDALL_GENERATOR = envStr("FINDALL_GENERATOR", "base")
export const FINDALL_MATCH_LIMIT = envNum("FINDALL_MATCH_LIMIT", 10)
export const FINDALL_ENRICH_PROCESSOR = envStr("FINDALL_ENRICH_PROCESSOR", "core")
