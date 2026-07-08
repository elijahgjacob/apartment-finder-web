"use client"

import { useCallback, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import type { Listing } from "@/types"

/** True if a listing belongs to the active city (compares the name before the
 *  first comma, case-insensitively). Listings with no recorded city are kept
 *  so a deployment's own monitor data is never hidden. */
function cityMatches(activeCity: string, listing: Listing): boolean {
  const stored = listing.details?.search_city
  if (!stored || !activeCity) return true
  const norm = (s: string) => s.split(",")[0].trim().toLowerCase()
  return norm(stored) === norm(activeCity)
}

export function useListings(
  done: boolean,
  mergeListings: (data: Listing[]) => void,
  city: string,
) {
  // Keep the latest city in a ref so the polling closures don't need to be
  // torn down and recreated on every keystroke in the city field.
  const cityRef = useRef(city)
  useEffect(() => {
    cityRef.current = city
  }, [city])

  const hydrateFromDb = useCallback(async () => {
    try {
      const res = await fetch(api("/api/listings"))
      if (!res.ok) return
      const data = (await res.json()) as Listing[]
      mergeListings(data.filter((l) => cityMatches(cityRef.current, l)))
    } catch { /* silent */ }
  }, [mergeListings])

  useEffect(() => {
    hydrateFromDb()
  }, [hydrateFromDb])

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(hydrateFromDb, 1500)
    return () => window.clearTimeout(t)
  }, [done, hydrateFromDb])

  useEffect(() => {
    const t = window.setInterval(hydrateFromDb, 30_000)
    return () => window.clearInterval(t)
  }, [hydrateFromDb])

  return { hydrateFromDb }
}
