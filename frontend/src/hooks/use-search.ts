"use client"

import { useState, useRef, useCallback } from "react"
import { api } from "@/lib/api"
import type { Listing } from "@/types"

export function useSearch() {
  const [query, setQuery] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const evtRef = useRef<EventSource | null>(null)

  const startSearch = useCallback(async (q: string, budget: number, opts: { keepListings?: boolean } = {}) => {
    if (!q.trim()) return
    evtRef.current?.close()
    setReasoning("")
    if (!opts.keepListings) setListings([])
    setNewIds(new Set())
    setError(null)
    setDone(false)
    setStreaming(true)

    try {
      const res = await fetch(api("/api/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, budget }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.detail ?? `HTTP ${res.status}`)
        setStreaming(false)
        return
      }
      const { task_id } = await res.json()
      const evt = new EventSource(api(`/api/tasks/${task_id}/stream`))
      evtRef.current = evt

      evt.addEventListener("reasoning", (e) => {
        setReasoning((p) => p + JSON.parse((e as MessageEvent).data).text)
      })
      evt.addEventListener("listing", (e) => {
        const incoming: Listing = JSON.parse((e as MessageEvent).data).listing
        setListings((p) => p.find((x) => x.id === incoming.id) ? p : [...p, incoming])
        if (opts.keepListings) setNewIds((p) => new Set(p).add(incoming.id))
      })
      evt.addEventListener("status", (e) => {
        if (JSON.parse((e as MessageEvent).data).status === "done") {
          evt.close(); setStreaming(false); setDone(true)
        }
      })
      evt.addEventListener("error", (e) => {
        let msg = "Search failed"
        try { msg = JSON.parse((e as MessageEvent).data).message } catch { /* default */ }
        evt.close(); setStreaming(false); setError(msg)
      })
      evt.onerror = () => {
        evt.close(); setStreaming(false)
        setError("Connection lost")
      }
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [])

  const mergeListings = useCallback((data: Listing[]) => {
    setListings((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]))
      for (const row of data) {
        if (!byId.has(row.id)) byId.set(row.id, row)
      }
      return Array.from(byId.values())
    })
  }, [])

  return {
    query, setQuery,
    reasoning, streaming, listings, newIds, error, done,
    startSearch, mergeListings, setError,
  } as const
}
