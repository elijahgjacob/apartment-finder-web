"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { api } from "@/lib/api"
import type { Listing } from "@/types"

function parseEventData<T>(e: Event): T | null {
  try {
    return JSON.parse((e as MessageEvent).data) as T
  } catch {
    return null
  }
}

export function useSearch() {
  const [query, setQuery] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const evtRef = useRef<EventSource | null>(null)

  const startSearch = useCallback(async (
    q: string,
    budget: number,
    opts: { city?: string; requirements?: string } = {},
  ) => {
    if (!q.trim()) return
    evtRef.current?.close()
    setReasoning("")
    setListings([])
    setError(null)
    setDone(false)
    setStreaming(true)

    try {
      const body: Record<string, unknown> = { query: q, budget }
      if (opts.city) body.city = opts.city
      if (opts.requirements) body.requirements = opts.requirements
      const res = await fetch(api("/api/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        const d = parseEventData<{ text: string }>(e)
        if (d?.text) setReasoning((p) => p + d.text)
      })
      evt.addEventListener("listing", (e) => {
        const d = parseEventData<{ listing: Listing }>(e)
        const incoming = d?.listing
        if (!incoming?.id) return
        setListings((p) => (p.find((x) => x.id === incoming.id) ? p : [...p, incoming]))
      })
      evt.addEventListener("status", (e) => {
        const d = parseEventData<{ status: string }>(e)
        if (d?.status === "done") {
          evt.close(); setStreaming(false); setDone(true)
        }
      })
      let gotNamedError = false
      evt.addEventListener("error", (e) => {
        const d = parseEventData<{ message: string }>(e)
        gotNamedError = true
        evt.close(); setStreaming(false); setError(d?.message ?? "Search failed")
      })
      evt.onerror = () => {
        evt.close(); setStreaming(false)
        if (!gotNamedError) setError("Connection lost")
      }
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [])

  // Close any live SSE stream when the hook unmounts so the connection and
  // its listeners don't leak.
  useEffect(() => () => evtRef.current?.close(), [])

  return {
    query, setQuery,
    reasoning, streaming, listings, error, done,
    startSearch, setError,
  } as const
}
