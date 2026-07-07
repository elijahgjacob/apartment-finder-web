"use client"

import { useCallback, useEffect } from "react"
import { api } from "@/lib/api"
import type { Listing } from "@/types"

export function useListings(
  done: boolean,
  mergeListings: (data: Listing[]) => void,
) {
  const hydrateFromDb = useCallback(async () => {
    try {
      const res = await fetch(api("/api/listings"))
      if (!res.ok) return
      const data = (await res.json()) as Listing[]
      mergeListings(data)
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
