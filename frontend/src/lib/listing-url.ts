// One source of truth (client + server) for telling an individual rental
// listing URL apart from a search-results / category / geo-index page.
// Individual listings carry a street address or a numeric id in the path;
// the patterns below only ever appear on list/category pages.

export const SEARCH_PAGE_PATTERNS: RegExp[] = [
  /\/apartments\/$/i,
  /\/apartments-\d+-bedrooms\/$/i,
  /\/apartments-under-\d+\/$/i,
  /\/\d+-bedroom-apartments/i,
  /\/rentals$/i,
  /\/apartments\/[a-z-]+(?:\/|$)/i,
  // Explicit search-results URLs (craigslist /search/apa?query=…, generic ?q=).
  /\/search[/?#]/i,
  /[?&](?:query|q|search|searchQueryState)=/i,
  /#search/i,
  // Category / geo-index list pages on the major aggregators.
  /\/for_rent\//i,                       // Trulia/Zillow: /for_rent/San_Francisco,CA
  /\/for_sale\//i,
  /-for-rent\/?(?:[?#]|$)/i,             // …/apartments-for-rent (Redfin/HotPads)
  /\/(?:city|zipcode|neighborhood|county|state)\/\d/i, // Redfin geo indexes
  /\/apartments-for-rent\/[a-z-]+\/?$/i, // Zumper geo search: /apartments-for-rent/san-francisco-ca
  // Price-band category pages, e.g. apartmentfinder /San-Francisco-Apartments/Under-3000
  /\/(?:under|over)-\$?\d{3,}(?:[/?#]|$)/i,
  /-apartments\/?$/i,                    // "…-Apartments" area list page
  /-apartments\/(?:under|over|cheap|luxury|pet|furnished|studio|\d)/i, // "…-Apartments/<filter>"
  /apartments-\d+-bedrooms?/i,           // zillow-style /…/apartments-2-bedrooms
  /\/shopping-centers?\//i,              // POI/directory pages (apartmenthomeliving)
]

// Aggregator hosts we never link to even if a URL looks listing-shaped —
// mirrors the server's default BLOCKED_DOMAINS so client link-picking agrees.
const BLOCKED_LINK_HOSTS = ["zillow.com", "apartments.com", "yelp.com"]

export function isSearchOrCategoryUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return SEARCH_PAGE_PATTERNS.some((p) => p.test(url))
}

/**
 * A safe, absolute http(s) URL that points at a specific page (has a path or
 * query) AND is not a search/category/index page — i.e. a real listing link.
 */
export function isIndividualListingUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url) // absolute only
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    if (BLOCKED_LINK_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return false
    const deep = u.pathname.replace(/\/+$/, "").length > 0 || u.search.length > 0
    return deep && !isSearchOrCategoryUrl(url)
  } catch {
    return false
  }
}
