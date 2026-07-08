"use client"

import { useState, useCallback } from "react"

export function useLocalStorage(key: string, fallbackMs = 24 * 3600 * 1000) {
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now() - fallbackMs
    try {
      const stored = window.localStorage.getItem(key)
      if (stored) {
        const n = parseInt(stored, 10)
        if (Number.isFinite(n)) return n
      }
    } catch {
      // localStorage can throw in private mode / when disabled — fall through.
    }
    return Date.now() - fallbackMs
  })

  const markAllSeen = useCallback(() => {
    const now = Date.now()
    setLastSeenAt(now)
    try {
      window.localStorage.setItem(key, String(now))
    } catch {
      // Ignore quota / disabled-storage errors; the in-memory value still updates.
    }
  }, [key])

  return { lastSeenAt, markAllSeen }
}
