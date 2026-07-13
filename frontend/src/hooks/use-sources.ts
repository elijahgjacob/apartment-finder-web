"use client"

import { useState, useEffect, useCallback } from "react"
import { ALL_MAJOR_DOMAINS, isRestricted, sanitizeDomain } from "@/lib/sources"

const STORAGE_KEY = "apartment-finder-sources"

type Stored = { selected: string[]; custom: string[] }

function load(): Stored {
  if (typeof window === "undefined") return { selected: ALL_MAJOR_DOMAINS, custom: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { selected: ALL_MAJOR_DOMAINS, custom: [] }
    const parsed = JSON.parse(raw) as Partial<Stored>
    const known = new Set(ALL_MAJOR_DOMAINS)
    return {
      selected: (parsed.selected ?? ALL_MAJOR_DOMAINS).filter((d) => known.has(d)),
      custom: (parsed.custom ?? []).map((d) => sanitizeDomain(d)).filter((d): d is string => !!d),
    }
  } catch {
    return { selected: ALL_MAJOR_DOMAINS, custom: [] }
  }
}

// Source picker state, persisted per browser. `activeSources` is null when
// the selection means "no restriction" (all majors, nothing custom) so the
// search flow can skip the allowlist entirely in the default case.
export function useSources() {
  const [selected, setSelected] = useState<string[]>(ALL_MAJOR_DOMAINS)
  const [custom, setCustom] = useState<string[]>([])

  // localStorage is only readable on the client, and reading it during the
  // first render would mismatch the server-rendered HTML — so hydrate the
  // stored selection in a one-shot post-mount effect instead.
  useEffect(() => {
    const s = load()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration, not a cascading sync
    setSelected(s.selected)
    setCustom(s.custom)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, custom }))
    } catch { /* private mode etc. — selection just won't persist */ }
  }, [selected, custom])

  const toggle = useCallback((domain: string) => {
    setSelected((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain],
    )
  }, [])

  const addCustom = useCallback((input: string): boolean => {
    const d = sanitizeDomain(input)
    if (!d) return false
    setCustom((prev) => (prev.includes(d) ? prev : [...prev, d]))
    return true
  }, [])

  const removeCustom = useCallback((domain: string) => {
    setCustom((prev) => prev.filter((d) => d !== domain))
  }, [])

  const reset = useCallback(() => {
    setSelected(ALL_MAJOR_DOMAINS)
    setCustom([])
  }, [])

  // Empty selection would be an allowlist that rejects everything; treat it
  // as "no restriction" (the UI says so) rather than a search that can't match.
  const restricted = isRestricted(selected, custom) && selected.length + custom.length > 0
  const activeSources = restricted ? [...selected, ...custom] : null

  return { selected, custom, toggle, addCustom, removeCustom, reset, restricted, activeSources } as const
}
