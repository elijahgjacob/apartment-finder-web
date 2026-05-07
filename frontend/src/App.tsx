import { useState, useRef, useCallback, useEffect } from "react"
import { SearchBar } from "./components/search-bar"
import { ReasoningPanel } from "./components/reasoning-panel"
import { StatsBar } from "./components/stats-bar"
import { ListingMap } from "./components/listing-map"
import { ListingCards } from "./components/listing-cards"
import { ListingTable } from "./components/listing-table"
import { useAppConfig } from "./config-context"
import type { Listing } from "./types"

const POLL_INTERVAL = 30_000

export default function App() {
  const config = useAppConfig()
  const [listings, setListings] = useState<Listing[]>([])
  const [reasoning, setReasoning] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [foundCount, setFoundCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const evtSourceRef = useRef<EventSource | null>(null)

  const fetchListings = useCallback(async () => {
    try {
      const res = await fetch("/api/listings")
      if (res.ok) {
        const data = await res.json()
        setListings(data)
        setLastRefresh(new Date())
      }
    } catch {
      /* polling failure is silent */
    }
  }, [])

  useEffect(() => {
    fetchListings()
    const interval = setInterval(fetchListings, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchListings])

  const connectStream = useCallback((taskId: string) => {
    const evtSource = new EventSource(`/api/tasks/${taskId}/stream`)
    evtSourceRef.current = evtSource
    let retries = 0

    evtSource.addEventListener("reasoning", (e) => {
      const data = JSON.parse(e.data)
      setReasoning((prev) => prev + data.text)
      retries = 0
    })

    evtSource.addEventListener("listing", (e) => {
      const data = JSON.parse(e.data)
      setListings((prev) => {
        const exists = prev.some((l) => l.id === data.listing.id)
        return exists ? prev : [...prev, data.listing]
      })
      setFoundCount((prev) => prev + 1)
      retries = 0
    })

    evtSource.addEventListener("ping", () => {
      retries = 0
    })

    evtSource.addEventListener("status", (e) => {
      const data = JSON.parse(e.data)
      if (data.status === "done") {
        evtSource.close()
        setSearching(false)
        setSearchDone(true)
        fetchListings()
      }
    })

    evtSource.addEventListener("error", (e) => {
      let msg = "Search failed"
      try { msg = JSON.parse(e.data).message } catch { /* use default */ }
      evtSource.close()
      setSearching(false)
      setError(msg)
    })

    evtSource.onerror = () => {
      evtSource.close()
      retries++
      if (retries < 5) {
        setTimeout(() => connectStream(taskId), 2000)
      } else {
        setSearching(false)
        setError("Connection lost after multiple retries")
      }
    }
  }, [fetchListings])

  const handleSearch = useCallback(async (query: string, budget: number) => {
    evtSourceRef.current?.close()
    setReasoning("")
    setSearching(true)
    setSearchDone(false)
    setFoundCount(0)
    setError(null)

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget }),
      })
      const { task_id } = await res.json()
      connectStream(task_id)
    } catch (err) {
      setSearching(false)
      setError(err instanceof Error ? err.message : "Failed to start search")
    }
  }, [connectStream])

  const showReasoning = searching || searchDone || error !== null

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-widest uppercase font-mono">
              {config?.appTitle ?? "Apartment Finder"}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.12em] uppercase font-mono">
              Live search · Auto-refresh{config?.referencePoint ? ` · ${config.referencePoint.name}` : ""}
            </p>
          </div>
          {lastRefresh && (
            <div className="text-[10px] text-muted-foreground font-mono tracking-[0.12em] uppercase">
              Updated {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <StatsBar listings={listings} />

        <ListingMap listings={listings} config={config} />

        {listings.length > 0 && (
          <>
            <ListingCards listings={listings.slice(0, 10)} />
            <ListingTable listings={listings} />
          </>
        )}

        <SearchBar onSearch={handleSearch} searching={searching} defaultBudget={config?.defaultBudget} />

        {showReasoning && (
          <ReasoningPanel
            reasoning={reasoning}
            searching={searching}
            done={searchDone}
            foundCount={foundCount}
            error={error}
          />
        )}
      </main>
    </div>
  )
}
