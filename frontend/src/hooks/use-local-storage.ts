"use client"

import { useState, useCallback } from "react"

export function useLocalStorage(key: string, fallbackMs = 24 * 3600 * 1000) {
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now() - fallbackMs
    const stored = window.localStorage.getItem(key)
    if (stored) {
      const n = parseInt(stored, 10)
      if (Number.isFinite(n)) return n
    }
    return Date.now() - fallbackMs
  })

  const markAllSeen = useCallback(() => {
    const now = Date.now()
    setLastSeenAt(now)
    window.localStorage.setItem(key, String(now))
  }, [key])

  return { lastSeenAt, markAllSeen }
}
