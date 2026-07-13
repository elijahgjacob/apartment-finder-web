// Candidate → listing parsing, plausibility filters, and scoring.
// Faithful port of the FastAPI backend's search_service/parsing logic.

import {
  BLOCKED_DOMAINS, LISTING_SITES, RENT_FLOORS,
  REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
} from "./config"
import { cityByName } from "@/lib/bay-area"
import type { Candidate } from "./parallel"

const NA_VALUES = new Set(["", "N/A", "NA", "null", "None", "unknown", "Unknown", "-"])

function outputVal(output: Candidate["output"], key: string): string | null {
  const obj = output?.[key]
  if (!obj) return null
  const v = obj.value
  if (v == null) return null
  const s = String(v).trim()
  return NA_VALUES.has(s) ? null : s
}

function outputFloat(output: Candidate["output"], key: string): number | null {
  const s = outputVal(output, key)
  if (!s) return null
  const m = s.match(/\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

function outputBool(
  output: Candidate["output"], key: string,
  trueWords: string[] = ["yes", "true", "available", "allowed", "included"],
): boolean | null {
  const s = outputVal(output, key)
  if (!s) return null
  const sl = s.toLowerCase()
  if (trueWords.some((w) => sl.includes(w))) return true
  if (["no", "none", "not", "false", "unavailable", "n/a"].some((w) => sl.includes(w))) return false
  return null
}

function parseIntLoose(s: string | null): number | null {
  if (!s) return null
  const m = s.replace(/\$/g, "").match(/[\d,]+/)
  if (!m) return null
  const n = parseInt(m[0].replace(/,/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

function cleanExtractedAddress(raw: string): string {
  let cleaned = raw.replace(/,?\s*\$[\d,.]+\/?(?:mo|month)?$/i, "")
  cleaned = cleaned.replace(/,?\s*\$[\d,.]+\s*$/, "")
  return cleaned.trim().replace(/,$/, "").trim()
}

function addressFromName(name: string): string | null {
  if (/\d+\s+\w+\s+(St|Ave|Blvd|Dr|Rd|Way|Ln|Pl|Ct)/.test(name)) {
    return cleanExtractedAddress(name)
  }
  return null
}

export function normalizeAddress(addr: string): string {
  let s = addr.toLowerCase().trim()
  s = s.replace(/\s*(apt|unit|suite|ste|#)\s*[\w-]+/gi, "")
  s = s.replace(/,?\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}(-\d{4})?$/, "")
  s = s.replace(/,?\s*[A-Z]{2}\s+\d{5}(-\d{4})?$/, "")
  s = s.replace(/,?\s*\d{5}(-\d{4})?$/, "")
  s = s.replace(/,?\s*[A-Z]{2}$/, "")
  return s.trim().replace(/,$/, "").trim()
}

function detectSource(url: string): string {
  for (const site of LISTING_SITES.split(",")) {
    const domain = site.trim()
    if (domain && url.includes(domain)) return domain.split(".")[0]
  }
  return "web"
}

function isBlockedUrl(url: string): boolean {
  if (!url) return false
  const u = url.toLowerCase()
  return BLOCKED_DOMAINS.some((d) => u.includes(d))
}

// Lower bound for price-plausibility checks: 55% of the typical rent for
// that bedroom count (permissive enough for BMR units, strict enough to
// catch street-number miscues). $400 floor when beds are unknown.
function absoluteMinPrice(beds: number | null, floors: Record<string, number> = RENT_FLOORS): number {
  if (beds == null) return 400
  const typical = floors[beds] ?? floors[Math.min(beds, 5)] ?? 800
  return Math.floor(typical * 0.55)
}

// Options threaded from the API routes: per-city rent floors / proximity
// anchor from the Bay Area table (defaults are the env-configured SF values).
// Note: user-selected sources are search *includes*, not a filter — they
// steer discovery via the FindAll objective and never reject results here.
export interface ParseOptions {
  floors?: Record<string, number>
  refLat?: number
  refLng?: number
}

const SEARCH_PAGE_PATTERNS = [
  /\/apartments\/$/i,
  /\/apartments-\d+-bedrooms\/$/i,
  /\/apartments-under-\d+\/$/i,
  /\/\d+-bedroom-apartments/i,
  /\/rentals$/i,
  /\/apartments\/[a-z-]+(?:\/|$)/i,
  // Search-results pages, not individual listings (e.g. craigslist
  // /search/apa?query=..., generic ?q=/query= result URLs).
  /\/search[/?#]/i,
  /[?&](?:query|q|search|searchQueryState)=/i,
  /#search/i,
  // Category / geo-index list pages on the major aggregators that survived
  // the checks above (individual listings carry a street address or numeric
  // id, so these markers never appear in a real listing path):
  /\/for_rent\//i,                       // Trulia/Zillow: /for_rent/San_Francisco,CA
  /\/for_sale\//i,
  /-for-rent\/?(?:[?#]|$)/i,             // Redfin/HotPads: …/apartments-for-rent
  /\/(?:city|zipcode|neighborhood|county|state)\/\d/i, // Redfin geo indexes
  /\/apartments-for-rent\/[a-z-]+\/?$/i, // Zumper geo search: /apartments-for-rent/san-francisco-ca
]

const JUNK_ADDRESS_PATTERNS = [
  /^[A-Z][a-z]+,?\s+[A-Z]{2}$/,
  /^[A-Z]{2}\s+\d{5}/,
  /^\$[\d,.]+/,
  /^\d{1,3}$/,
  /apartments?\s+for\s+rent/i,
  /bedroom\s+apartments?\s+in/i,
  /rentals?\s+in\s+/i,
  /housing\s+in\s+/i,
]

export interface ParsedListing {
  id: string
  title: string | null
  address: string | null
  neighborhood: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  lat: number | null
  lng: number | null
  geo_precision: "address" | "neighborhood" | null
  source: string
  url: string | null
  has_parking: boolean
  has_laundry: boolean
  spam_score: number
  phone: string | null
  body: string | null
  details: Record<string, unknown>
  match_basis: { name: string; value: string; matched: boolean }[]
  citations: { title: string; url: string }[]
  score: number
}

export function candidateToListing(
  candidate: Candidate,
  minBeds: number | null,
  opts: ParseOptions = {},
): Omit<ParsedListing, "score"> | null {
  const name = candidate.name ?? ""
  const url = candidate.url ?? ""
  const description = candidate.description ?? ""
  const output = candidate.output ?? {}

  if (!url || isBlockedUrl(url)) return null
  if (SEARCH_PAGE_PATTERNS.some((p) => p.test(url))) return null

  const address = outputVal(output, "street_address") || addressFromName(name) || name
  if (!address || address.length < 5) return null

  let price = parseIntLoose(outputVal(output, "monthly_rent_usd"))
  if (price == null) {
    for (const [key, obj] of Object.entries(output)) {
      const val = obj?.value
      if (!val) continue
      if (key.includes("rent") || key.includes("price") || key.includes("cost") || key.includes("amount")) {
        price = parseIntLoose(String(val))
        if (price != null) break
      }
    }
  }

  let beds = parseIntLoose(outputVal(output, "bedrooms"))
  if (beds == null) {
    for (const [key, obj] of Object.entries(output)) {
      const val = obj?.value
      if (!val) continue
      if (key.includes("bedroom") || (key.includes("bed") && key.includes("br"))) {
        beds = parseIntLoose(String(val))
        if (beds != null) break
      }
    }
  }

  if (price != null && (price < 500 || price > 50000)) price = null
  if (beds != null && (beds < 0 || beds > 10)) beds = null
  if (price != null && price < absoluteMinPrice(beds, opts.floors)) return null

  // Street-number miscue guard: reject if the "price" appears in the address.
  if (price != null) {
    for (const m of address.matchAll(/\d+/g)) {
      if (parseInt(m[0], 10) === price) return null
    }
  }

  if (minBeds && beds != null && beds < minBeds) return null
  if (JUNK_ADDRESS_PATTERNS.some((p) => p.test(address.trim()))) return null

  const hasStreetNumber = /\d+\s+\w+/.test(address)
  const isNamedBuilding = /(apartments?|towers?|plaza|square|heights|village|terrace|residences|lofts|place)/i.test(name)
  if (!hasStreetNumber && !isNamedBuilding) return null

  const bathrooms = outputFloat(output, "bathrooms")
  const sqftStr = outputVal(output, "square_feet")
  let sqft = sqftStr && /\d/.test(sqftStr) ? parseInt(sqftStr.replace(/\D/g, ""), 10) : null
  if (sqft != null && (sqft < 100 || sqft > 10000)) sqft = null

  const parkingType = outputVal(output, "parking_type")
  const laundryType = outputVal(output, "laundry_type")
  let hasParking = outputBool(output, "parking_type",
    ["garage", "covered", "carport", "parking", "yes", "available", "included"])
  if (hasParking == null && parkingType) {
    hasParking = !parkingType.toLowerCase().includes("no") && !parkingType.toLowerCase().includes("none")
  }
  let hasLaundry = outputBool(output, "laundry_type",
    ["in-unit", "in unit", "washer", "dryer", "laundry", "yes", "shared"])
  if (hasLaundry == null && laundryType) {
    hasLaundry = !laundryType.toLowerCase().includes("no") && !laundryType.toLowerCase().includes("none")
  }

  const isActiveStr = outputVal(output, "is_currently_active")
  let isCurrentlyActive: boolean | null = null
  if (isActiveStr != null) {
    const sl = isActiveStr.trim().toLowerCase()
    if (["yes", "true", "active", "available"].includes(sl)) isCurrentlyActive = true
    else if (["no", "false", "leased", "rented", "pending", "unavailable", "removed", "off-market"].includes(sl)) {
      isCurrentlyActive = false
    }
  }

  const daysStr = outputVal(output, "days_on_market")
  let daysOnMarket: number | null = null
  if (daysStr != null) {
    const n = parseInt(daysStr.replace(/\D/g, "") || "0", 10)
    daysOnMarket = n >= 0 && n <= 3650 ? n : null
  }

  const detailsRaw: Record<string, unknown> = {
    available_date: outputVal(output, "available_date"),
    lease_term: outputVal(output, "lease_term"),
    pet_policy: outputVal(output, "pet_policy"),
    is_furnished: outputBool(output, "is_furnished"),
    utilities_included: outputVal(output, "utilities_included"),
    amenities: outputVal(output, "building_amenities"),
    neighborhood_name: outputVal(output, "neighborhood"),
    parking_type: parkingType,
    laundry_type: laundryType,
    is_currently_active: isCurrentlyActive,
    days_on_market: daysOnMarket,
  }
  const details = Object.fromEntries(
    Object.entries(detailsRaw).filter(([, v]) => v != null && v !== ""),
  )

  const matchBasis: { name: string; value: string; matched: boolean }[] = []
  for (const [key, obj] of Object.entries(output)) {
    if (obj?.type === "match_condition") {
      matchBasis.push({ name: key, value: String(obj.value ?? ""), matched: Boolean(obj.is_matched) })
    }
  }

  const citations: { title: string; url: string }[] = []
  const seen = new Set<string>()
  for (const b of candidate.basis ?? []) {
    for (const c of b.citations ?? []) {
      if (c.url && !seen.has(c.url)) {
        seen.add(c.url)
        citations.push({ title: (c.title ?? c.url).slice(0, 120), url: c.url })
      }
    }
  }

  return {
    id: url, // stable across polls; saved-targets also keys by url
    title: name,
    address,
    neighborhood: (details.neighborhood_name as string) ?? null,
    price,
    bedrooms: beds,
    bathrooms,
    sqft,
    lat: null,
    lng: null,
    geo_precision: null,
    source: detectSource(url),
    url,
    has_parking: hasParking ?? false,
    has_laundry: hasLaundry ?? false,
    spam_score: 0,
    phone: outputVal(output, "contact_phone"),
    body: description,
    details,
    match_basis: matchBasis,
    citations: citations.slice(0, 5),
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Equal-weight 3-factor score (recency + price fit + proximity), max 100.
// Every result is freshly discovered, so recency is always full.
export function scoreListing(
  l: {
    price: number | null; bedrooms: number | null
    lat: number | null; lng: number | null
    geo_precision?: "address" | "neighborhood" | null
  },
  budget: number,
  opts: ParseOptions = {},
): number {
  let score = 33
  const floors = opts.floors ?? RENT_FLOORS

  if (l.price) {
    const typical = l.bedrooms != null
      ? floors[l.bedrooms] ?? floors[Math.min(l.bedrooms, 5)]
      : undefined
    const ratio = budget ? l.price / budget : 1.0
    let pricePts: number
    if (ratio > 1.0) pricePts = 0
    else if (typical != null && l.price < typical * 0.6) pricePts = 6
    else if (ratio <= 0.7) pricePts = 33
    else if (ratio <= 0.8) pricePts = 28
    else if (ratio <= 0.9) pricePts = 22
    else pricePts = 14
    score += pricePts
  }

  // Proximity, up to 33. A failed geocode is not evidence the unit is far
  // away, so unknown location earns a neutral 12 instead of 0 (otherwise the
  // listing caps at 66 and falls below the strong-fit bar on geocoder luck).
  // Neighborhood-centroid coords are approximate, so their tiers are
  // discounted 25%.
  if (l.lat != null && l.lng != null) {
    const km = haversineKm(
      l.lat, l.lng,
      opts.refLat ?? REFERENCE_POINT_LAT, opts.refLng ?? REFERENCE_POINT_LNG,
    )
    const full = km < 1.0 ? 33 : km < 2.5 ? 24 : km < 5.0 ? 16 : 9
    score += l.geo_precision === "neighborhood" ? Math.round(full * 0.75) : full
  } else {
    score += 12
  }

  return Math.min(score, 100)
}

export function parseCandidates(
  candidates: Candidate[],
  minBeds: number | null,
  budget: number,
  opts: ParseOptions = {},
): ParsedListing[] {
  const seenAddresses = new Set<string>()
  const out: ParsedListing[] = []
  for (const c of candidates) {
    const l = candidateToListing(c, minBeds, opts)
    if (!l) continue
    const norm = normalizeAddress(l.address ?? "")
    if (norm && norm.length > 3) {
      if (seenAddresses.has(norm)) continue
      seenAddresses.add(norm)
    }
    out.push({ ...l, score: scoreListing(l, budget, opts) })
  }
  return out
}

// Shared by the poll/finalize routes: decode the request's city param into
// ParseOptions (per-city rent floors + proximity anchor from the Bay Area
// table). Source selection is a discovery-time include, not a parse filter.
export function parseOptionsFrom(sp: URLSearchParams): ParseOptions {
  const opts: ParseOptions = {}
  const city = cityByName(sp.get("city"))
  if (city) {
    opts.floors = city.rentFloors
    opts.refLat = city.referencePoint.lat
    opts.refLng = city.referencePoint.lng
  }
  return opts
}

export function extractMinBeds(query: string): number | null {
  const m = query.match(/(\d+)\s*(?:br|bed|bedroom)/i)
  return m ? parseInt(m[1], 10) : null
}
