import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Return `url` only if it is a safe http(s) link, otherwise `fallback`.
 * Listing and citation URLs are scraped/LLM-extracted (untrusted); React
 * does not block `javascript:`/`data:` hrefs, so we allow-list schemes here.
 */
export function safeUrl(url: string | null | undefined, fallback = "#"): string {
  if (!url) return fallback
  try {
    const u = new URL(url, "https://example.invalid")
    return u.protocol === "http:" || u.protocol === "https:" ? url : fallback
  } catch {
    return fallback
  }
}

/**
 * A safe http(s) link that points at a specific page — not a bare domain /
 * homepage. "Deep" means an absolute URL with a real path or query.
 */
export function isDeepLink(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url) // absolute only
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return u.pathname.replace(/\/+$/, "").length > 0 || u.search.length > 0
  } catch {
    return false
  }
}

/**
 * Pick the outbound link for a listing. Always resolve to the specific source
 * page, never a top-level domain / homepage: prefer the listing URL, then the
 * first deep citation (the page the data was pulled from), and only fall back
 * (e.g. to an address search) when no real source page exists.
 */
export function pickSourceUrl(
  url: string | null | undefined,
  citations: { url: string }[] | null | undefined,
  fallback = "#",
): string {
  if (isDeepLink(url)) return url as string
  const cite = citations?.find((c) => isDeepLink(c.url))
  return cite ? cite.url : fallback
}

/** Escape a string for safe interpolation into a raw HTML string. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
