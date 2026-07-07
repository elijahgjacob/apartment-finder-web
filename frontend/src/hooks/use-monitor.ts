"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import type { MonitorStatus } from "@/types"

export function useMonitor(query: string) {
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null)
  const [monitorBusy, setMonitorBusy] = useState(false)
  const [watchOnSubmit, setWatchOnSubmit] = useState(false)
  const initialFetchDone = useRef(false)

  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch(api("/api/monitor"))
      if (res.ok) setMonitor(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true
      fetchMonitor()
    }
    const t = window.setInterval(fetchMonitor, 30_000)
    return () => window.clearInterval(t)
  }, [fetchMonitor])

  useEffect(() => {
    if (!monitor?.active) return
    const watched = (monitor.query ?? "").trim()
    if (watched && watched === query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWatchOnSubmit(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitor?.active, monitor?.query])

  const watchThisQuery = useCallback(async () => {
    const q = query.trim()
    if (!q) return "Type a query first, then save it as the watch."
    setMonitorBusy(true)
    try {
      const res = await fetch(api("/api/monitor"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return j.detail ?? `HTTP ${res.status}`
      }
      setMonitor(await res.json())
      return null
    } catch (e) {
      return e instanceof Error ? e.message : "monitor save failed"
    } finally {
      setMonitorBusy(false)
    }
  }, [query])

  const stopBackendMonitor = useCallback(async () => {
    setMonitorBusy(true)
    try {
      await fetch(api("/api/monitor"), { method: "DELETE" })
      await fetchMonitor()
    } finally {
      setMonitorBusy(false)
    }
  }, [fetchMonitor])

  return {
    monitor, monitorBusy,
    watchOnSubmit, setWatchOnSubmit,
    watchThisQuery, stopBackendMonitor,
  }
}
