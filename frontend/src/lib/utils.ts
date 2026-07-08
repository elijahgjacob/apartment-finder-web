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

/** Escape a string for safe interpolation into a raw HTML string. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
