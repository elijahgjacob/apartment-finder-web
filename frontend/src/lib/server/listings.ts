// Candidate → listing parsing, plausibility filters, and scoring.
// Faithful port of the FastAPI backend's search_service/parsing logic.

import {
  BLOCKED_DOMAINS, LISTING_SITES, RENT_FLOORS,
  REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
} from "./config"
import { cityByName } from "@/lib/bay-area"
import { isSearchOrCategoryUrl } from "@/lib/listing-url"
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

function normalizeAddress(addr: string): string {
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
// anchor from the Bay Area table (defaults are the env-configured SF values),
// plus the bedroom min/max parsed from the query (studio → max 0). Bedroom
// bounds and budget are RANKING signals in scoreListing, never hard drops.
// Note: user-selected sources are search *includes*, not a filter — they
// steer discovery via the FindAll objective and never reject results here.
export interface ParseOptions {
  floors?: Record<string, number>
  refLat?: number
  refLng?: number
  minBeds?: number | null
  maxBeds?: number | null
}

// A wide rent range in the extracted evidence ("$1,255 - $2,980") is the
// signature of a multi-unit building or category page, not a single unit.
// Lease-term variance on one unit stays narrow, so only flag ratios ≥ 1.4.
function hasWideRentRange(strings: (string | null | undefined)[]): boolean {
  for (const s of strings) {
    if (!s) continue
    const m = s.match(/\$?\s*(\d[\d,]{2,})\s*(?:-|–|—|to)\s*\$?\s*(\d[\d,]{2,})/)
    if (!m) continue
    const lo = parseInt(m[1].replace(/,/g, ""), 10)
    const hi = parseInt(m[2].replace(/,/g, ""), 10)
    if (lo > 0 && hi > lo && hi / lo >= 1.4) return true
  }
  return false
}

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

function candidateToListing(
  candidate: Candidate,
  opts: ParseOptions = {},
  drops?: Record<string, number>,
): Omit<ParsedListing, "score"> | null {
  const name = candidate.name ?? ""
  const url = candidate.url ?? ""
  const description = candidate.description ?? ""
  const output = candidate.output ?? {}
  // Record why a candidate is dropped (for the finalize funnel log).
  const rej = (reason: string): null => {
    if (drops) drops[reason] = (drops[reason] ?? 0) + 1
    return null
  }

  if (!url) return rej("no_url")
  if (isBlockedUrl(url)) return rej("blocked_host")
  if (isSearchOrCategoryUrl(url)) return rej("category_page")

  // Multi-unit building / category page: the rent evidence spans a wide range
  // rather than naming one unit's price. Reject so these don't pose as a unit.
  const matchConditionValues = Object.values(output)
    .filter((o) => o?.type === "match_condition")
    .map((o) => String(o?.value ?? ""))
  if (hasWideRentRange([outputVal(output, "monthly_rent_usd"), ...matchConditionValues])) return rej("wide_price_range")

  const address = outputVal(output, "street_address") || addressFromName(name) || name
  if (!address || address.length < 5) return rej("no_address")

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

  // Pre-enrichment fallback: FindAll candidate names often embed the facts
  // ("2500 Mission St Apt 301, $4,550, 2 bedrooms, Mission"), so parse price
  // and beds out of the name/description rather than showing "? bd" while
  // enrichment is still running. Enriched values (above) always win. The $
  // anchor keeps street numbers from being mistaken for a price.
  const nameAndDesc = `${name} ${description}`
  if (price == null) {
    const m = nameAndDesc.match(/\$\s*([\d,]{3,})(?:\s*\/\s*mo(?:nth)?)?/i)
    if (m) price = parseIntLoose(m[1])
  }
  if (beds == null) {
    if (/\bstudio\b/i.test(nameAndDesc)) {
      beds = 0
    } else {
      const m = nameAndDesc.match(/\b(\d{1,2})\s*(?:bed(?:room)?s?|br|bd)\b/i)
      if (m) beds = parseInt(m[1], 10)
    }
  }

  if (price != null && (price < 500 || price > 50000)) price = null
  if (beds != null && (beds < 0 || beds > 10)) beds = null

  // We intentionally do NOT reject listings missing an extracted price/beds.
  // If it's a real, accessible individual listing (it passed the category /
  // blocked-host / wide-range / address-shape gates), show it with details
  // blank rather than hide a place the user could actually open.

  if (price != null && price < absoluteMinPrice(beds, opts.floors)) return rej("below_price_floor")

  // Bedroom count (min/max from the query) is a RANKING signal, not a hard
  // gate — see scoreListing. Dropping bedroom mismatches outright left studio
  // searches (etc.) with zero results when only nearby-size units enriched.

  // Street-number miscue guard: reject if the "price" appears in the address.
  if (price != null) {
    for (const m of address.matchAll(/\d+/g)) {
      if (parseInt(m[0], 10) === price) return rej("price_is_address")
    }
  }

  if (JUNK_ADDRESS_PATTERNS.some((p) => p.test(address.trim()))) return rej("junk_address")

  const hasStreetNumber = /\d+\s+\w+/.test(address)
  const isNamedBuilding = /(apartments?|towers?|plaza|square|heights|village|terrace|residences|lofts|place)/i.test(name)
  if (!hasStreetNumber && !isNamedBuilding) return rej("not_listing_shaped")

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

  // Bedroom fit: a known mismatch vs the requested min/max is demoted (so
  // exact-size units rank first) but never dropped — a studio search should
  // still surface nearby 1BRs rather than nothing. ~15 points per bedroom off.
  if (l.bedrooms != null) {
    if (opts.minBeds != null && l.bedrooms < opts.minBeds) score -= 15 * (opts.minBeds - l.bedrooms)
    if (opts.maxBeds != null && l.bedrooms > opts.maxBeds) score -= 15 * (l.bedrooms - opts.maxBeds)
  }

  return Math.max(0, Math.min(score, 100))
}

export function parseCandidates(
  candidates: Candidate[],
  minBeds: number | null,
  budget: number,
  opts: ParseOptions = {},
  drops?: Record<string, number>,
): ParsedListing[] {
  // Bedroom min/max feed scoreListing as ranking signals; accept it either
  // positionally (minBeds) or via opts, whichever the caller set.
  const o: ParseOptions = { ...opts, minBeds: opts.minBeds ?? minBeds }
  const seenAddresses = new Set<string>()
  const out: ParsedListing[] = []
  for (const c of candidates) {
    const l = candidateToListing(c, o, drops)
    if (!l) continue
    // Budget and bedroom fit are ranking signals, not hard gates: an
    // accessible listing that's a bit over budget or a nearby size is still
    // worth showing (scoring sinks it below the strong fits) rather than
    // hidden. We only surface accessible individual listings.
    const norm = normalizeAddress(l.address ?? "")
    if (norm && norm.length > 3) {
      if (seenAddresses.has(norm)) {
        if (drops) drops.duplicate_address = (drops.duplicate_address ?? 0) + 1
        continue
      }
      seenAddresses.add(norm)
    }
    out.push({ ...l, score: scoreListing(l, budget, o) })
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
  const maxBedsRaw = sp.get("maxBeds")
  if (maxBedsRaw != null && maxBedsRaw !== "") {
    const n = Number(maxBedsRaw)
    if (Number.isFinite(n)) opts.maxBeds = n
  }
  const minBedsRaw = sp.get("minBeds")
  if (minBedsRaw != null && minBedsRaw !== "") {
    const n = Number(minBedsRaw)
    if (Number.isFinite(n)) opts.minBeds = n
  }
  return opts
}

// Bedroom intent parsed from a free-text query. A studio search has an exact
// ceiling of 0; "2 bedroom" is a floor of 2 with no ceiling (2+ is fine).
export function bedroomBounds(query: string): { min: number | null; max: number | null } {
  if (/\bstudios?\b/i.test(query) && !/\d\s*(?:br|bed|bedroom)/i.test(query)) {
    return { min: 0, max: 0 }
  }
  const m = query.match(/(\d+)\s*(?:br|bed|bedroom)/i)
  return m ? { min: parseInt(m[1], 10), max: null } : { min: null, max: null }
}
