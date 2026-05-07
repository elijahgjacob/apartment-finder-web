import { useState, useRef, useCallback, useEffect } from "react"
import { useAppConfig } from "./config-context"
import type { Listing } from "./types"

// Brand-blue tuned to match the Zillow lockup. Deep, vibrant.
const Z = {
  blue: "#1F45FC",
  blueDark: "#1736C7",
  blueSoft: "#E8EDFF",
  blueBorder: "#C0CDFF",
  text: "#13192C",
  textSoft: "#54575C",
  textFaint: "#83868C",
  bgPage: "#F4F5F6",
  bgCard: "#FFFFFF",
  border: "#E5E7EB",
  green: "#0E8A16",
  amber: "#A66300",
  red: "#B5181E",
}

const FONT_HEADING = "'Geist Variable', 'Geist', system-ui, sans-serif"
const FONT_BODY = "'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const SUGGESTIONS = [
  "Quiet 2-bedroom with a yard near a good elementary school under $4500",
  "Pet-friendly studio in SoMa or Mission, available before December, under $3000",
  "3BR with in-unit laundry and parking, walk to Caltrain, under $7000",
  "Furnished 1BR for a 6-month lease, dog-friendly, under $4000",
]

const MONITOR_INTERVALS: { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
  { label: "15 min", seconds: 900 },
  { label: "30 min", seconds: 1800 },
]

function MatchPills({ listing }: { listing: Listing }) {
  if (!listing.match_basis?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {listing.match_basis.map((m) => {
        const ok = m.matched
        return (
          <span
            key={m.name}
            className="text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{
              backgroundColor: ok ? Z.blueSoft : Z.bgPage,
              color: ok ? Z.blueDark : Z.textFaint,
              border: `1px solid ${ok ? Z.blueBorder : Z.border}`,
              fontWeight: 500,
            }}
          >
            <span style={{ color: ok ? Z.blue : Z.textFaint, fontWeight: 700 }}>{ok ? "✓" : "·"}</span>
            <span>{m.name.replaceAll("_", " ")}</span>
            {m.value && (
              <span style={{ color: ok ? Z.text : Z.textFaint, opacity: 0.85, fontWeight: 400 }}>
                — {m.value.length > 30 ? m.value.slice(0, 30) + "…" : m.value}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function Citations({ listing }: { listing: Listing }) {
  if (!listing.citations?.length) return null
  return (
    <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderColor: Z.border }}>
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: Z.textFaint }}>
        Sources
      </span>
      {listing.citations.map((c, i) => {
        let host = c.url
        try { host = new URL(c.url).hostname.replace(/^www\./, "") } catch { /* keep */ }
        return (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] hover:underline truncate max-w-[260px]"
            style={{ color: Z.blueDark, fontWeight: 500 }}
            title={c.title}
          >
            [{i + 1}] {host}
          </a>
        )
      })}
    </div>
  )
}

function DemoListingCard({ l, idx, city, isNew }: { l: Listing; idx: number; city: string; isNew: boolean }) {
  const href = l.url ?? `https://www.google.com/search?q=${encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)}`
  return (
    <article
      className={`rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-5 ${isNew ? "animate-in fade-in slide-in-from-bottom-2 duration-500" : ""}`}
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${isNew ? Z.blueBorder : Z.border}`,
        boxShadow: isNew ? `0 0 0 3px ${Z.blueSoft}` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: Z.blue, color: "white" }}
            >
              {idx + 1}
            </span>
            {l.neighborhood && (
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: Z.textFaint }}>
                {l.neighborhood}
              </span>
            )}
            <span
              className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded"
              style={{ backgroundColor: Z.bgPage, color: Z.textSoft }}
            >
              {l.source}
            </span>
            {isNew && (
              <span
                className="text-[10px] uppercase font-bold px-2 py-0.5 rounded animate-pulse"
                style={{ backgroundColor: Z.blueSoft, color: Z.blueDark }}
              >
                new
              </span>
            )}
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold hover:underline block leading-tight"
            style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.01em" }}
          >
            {l.address ?? l.title ?? "—"}
          </a>
          <div className="text-sm mt-2 flex flex-wrap items-center gap-x-2" style={{ color: Z.textSoft }}>
            <strong style={{ color: Z.text, fontWeight: 600 }}>{l.bedrooms ?? "?"}</strong>
            <span>bd</span>
            {l.bathrooms != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.bathrooms}</strong><span>ba</span></>)}
            {l.sqft != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.sqft.toLocaleString()}</strong><span>sqft</span></>)}
            {l.has_parking && (<><span style={{ color: Z.textFaint }}>·</span><span>parking</span></>)}
            {l.has_laundry && (<><span style={{ color: Z.textFaint }}>·</span><span>laundry</span></>)}
          </div>
          {(l.details?.available_date || l.details?.lease_term || l.details?.pet_policy) && (
            <div className="text-[12px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: Z.textSoft }}>
              {l.details?.available_date && <span><span style={{ color: Z.textFaint }}>Available:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.available_date}</strong></span>}
              {l.details?.lease_term && <span><span style={{ color: Z.textFaint }}>Lease:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.lease_term}</strong></span>}
              {l.details?.pet_policy && <span><span style={{ color: Z.textFaint }}>Pets:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.pet_policy}</strong></span>}
            </div>
          )}
          <MatchPills listing={l} />
          <Citations listing={l} />
        </div>
        <div className="text-right shrink-0">
          <div className="text-[26px] font-bold leading-none" style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.02em" }}>
            {l.price ? `$${l.price.toLocaleString()}` : "—"}
          </div>
          {l.price && (
            <div className="text-[11px] mt-1" style={{ color: Z.textFaint }}>per month</div>
          )}
          {l.score != null && (
            <div className="mt-2 text-[10px] uppercase font-bold tracking-wider" style={{ color: Z.blueDark }}>
              {l.score}/100
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

export default function Demo() {
  const config = useAppConfig()
  const city = config?.cityShort ?? "San Francisco"

  const [query, setQuery] = useState("")
  const [budget, setBudget] = useState<number>(config?.defaultBudget ?? 7500)
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const evtRef = useRef<EventSource | null>(null)
  const reasoningRef = useRef<HTMLDivElement | null>(null)

  // ── Live Monitor state ──
  const [monitorOn, setMonitorOn] = useState(false)
  const [monitorInterval, setMonitorInterval] = useState(300)  // seconds
  const [monitorQuery, setMonitorQuery] = useState<string>("")
  const [secondsToNext, setSecondsToNext] = useState<number>(0)
  const monitorTimerRef = useRef<number | null>(null)
  const monitorTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (config?.defaultBudget && budget === 7500) setBudget(config.defaultBudget)
  }, [config?.defaultBudget, budget])

  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning])

  // accumulating mode: appends new listings instead of replacing
  const startSearch = useCallback(async (q: string, opts: { keepListings?: boolean } = {}) => {
    if (!q.trim()) return
    evtRef.current?.close()
    setReasoning("")
    if (!opts.keepListings) setListings([])
    setNewIds(new Set())
    setError(null)
    setDone(false)
    setStreaming(true)

    try {
      const res = await fetch("/api/tasks", {
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
      const evt = new EventSource(`/api/tasks/${task_id}/stream`)
      evtRef.current = evt

      evt.addEventListener("reasoning", (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        setReasoning((p) => p + d.text)
      })
      evt.addEventListener("listing", (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        const incoming: Listing = d.listing
        setListings((p) => {
          if (p.find((x) => x.id === incoming.id)) return p
          return [...p, incoming]
        })
        if (opts.keepListings) {
          setNewIds((p) => new Set(p).add(incoming.id))
        }
      })
      evt.addEventListener("status", (e) => {
        const d = JSON.parse((e as MessageEvent).data)
        if (d.status === "done") {
          evt.close()
          setStreaming(false)
          setDone(true)
        }
      })
      evt.addEventListener("error", (e) => {
        let msg = "Search failed"
        try { msg = JSON.parse((e as MessageEvent).data).message } catch { /* default */ }
        evt.close()
        setStreaming(false)
        setError(msg)
      })
      evt.onerror = () => {
        evt.close()
        setStreaming(false)
        if (!done) setError("Connection lost")
      }
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [budget, done])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startSearch(query)
    if (monitorOn) setMonitorQuery(query)  // update monitor target
  }

  // ── Monitor lifecycle ──
  const stopMonitor = useCallback(() => {
    if (monitorTimerRef.current) { window.clearInterval(monitorTimerRef.current); monitorTimerRef.current = null }
    if (monitorTickRef.current) { window.clearInterval(monitorTickRef.current); monitorTickRef.current = null }
    setMonitorOn(false)
    setMonitorQuery("")
    setSecondsToNext(0)
  }, [])

  const startMonitor = useCallback(() => {
    const q = query.trim()
    if (!q) {
      setError("Enter a query first, then click Live Monitor.")
      return
    }
    setMonitorQuery(q)
    setMonitorOn(true)
    setSecondsToNext(monitorInterval)
    if (!streaming) startSearch(q, { keepListings: true })

    if (monitorTimerRef.current) window.clearInterval(monitorTimerRef.current)
    if (monitorTickRef.current) window.clearInterval(monitorTickRef.current)

    // re-run search every interval
    monitorTimerRef.current = window.setInterval(() => {
      startSearch(q, { keepListings: true })
      setSecondsToNext(monitorInterval)
    }, monitorInterval * 1000)

    // tick countdown every second
    monitorTickRef.current = window.setInterval(() => {
      setSecondsToNext((s) => (s > 0 ? s - 1 : monitorInterval))
    }, 1000)
  }, [query, monitorInterval, startSearch, streaming])

  // re-arm timers if interval changes while running
  useEffect(() => {
    if (!monitorOn) return
    if (monitorTimerRef.current) window.clearInterval(monitorTimerRef.current)
    monitorTimerRef.current = window.setInterval(() => {
      if (monitorQuery) startSearch(monitorQuery, { keepListings: true })
      setSecondsToNext(monitorInterval)
    }, monitorInterval * 1000)
    setSecondsToNext(monitorInterval)
    return () => { if (monitorTimerRef.current) window.clearInterval(monitorTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorInterval])

  // cleanup on unmount
  useEffect(() => () => { stopMonitor() }, [stopMonitor])

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: Z.bgPage, color: Z.text, fontFamily: FONT_BODY }}
    >
      <header className="bg-white border-b" style={{ borderColor: Z.border }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/zillow-logo.png" alt="Zillow" className="h-7 w-auto" />
            <span
              className="hidden sm:inline-block pl-4 border-l text-xs font-semibold uppercase tracking-wider"
              style={{ borderColor: Z.border, color: Z.textSoft }}
            >
              AI Search
            </span>
          </div>
          <a
            href="/"
            className="text-xs font-semibold hover:underline"
            style={{ color: Z.blueDark }}
          >
            ← back to listings
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-8">
          <h1
            className="font-bold mb-3"
            style={{
              fontFamily: FONT_HEADING,
              color: Z.text,
              fontSize: "2.5rem",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Find your home in your own words.
          </h1>
          <p className="text-base mb-6 max-w-2xl leading-relaxed" style={{ color: Z.textSoft }}>
            Describe what you want like you'd tell a friend. The assistant searches the web,
            verifies every match against your criteria, and returns each result with cited sources —
            no guessing, no hallucinated listings.
          </p>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl shadow-sm flex flex-col sm:flex-row gap-2 p-2 mb-3"
            style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
          >
            <input
              type="text"
              placeholder={`Try: "Quiet 3BR with parking and laundry near Caltrain, available December, under $7000"`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent px-4 py-3 text-base focus:outline-none"
              style={{ color: Z.text }}
              autoFocus
            />
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
              step={250}
              min={500}
              max={30000}
              className="bg-transparent px-3 py-3 w-32 text-base font-semibold text-right focus:outline-none border-l"
              style={{ color: Z.text, borderColor: Z.border, fontFamily: FONT_HEADING }}
              title="Max monthly rent"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="px-6 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: Z.blue, fontFamily: FONT_HEADING, letterSpacing: "0.01em" }}
            >
              {streaming ? "Searching…" : "Search"}
            </button>
          </form>

          {/* Live Monitor strip */}
          <div
            className="rounded-xl flex flex-wrap items-center gap-3 px-4 py-3 mb-4"
            style={{
              backgroundColor: monitorOn ? Z.blueSoft : Z.bgCard,
              border: `1px solid ${monitorOn ? Z.blueBorder : Z.border}`,
            }}
          >
            <button
              type="button"
              onClick={monitorOn ? stopMonitor : startMonitor}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={{
                backgroundColor: monitorOn ? Z.red : Z.blue,
                color: "white",
                fontFamily: FONT_HEADING,
              }}
            >
              {monitorOn ? "■ Stop monitor" : "● Start live monitor"}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: Z.textFaint }}>
                Refresh every
              </label>
              <select
                value={monitorInterval}
                onChange={(e) => setMonitorInterval(parseInt(e.target.value))}
                className="bg-white border rounded-md px-2 py-1 text-sm font-semibold"
                style={{ color: Z.text, borderColor: Z.border, fontFamily: FONT_HEADING }}
              >
                {MONITOR_INTERVALS.map((m) => (
                  <option key={m.seconds} value={m.seconds}>{m.label}</option>
                ))}
              </select>
            </div>
            {monitorOn ? (
              <div className="text-sm flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: Z.blue }} />
                <span style={{ color: Z.text }}>Monitoring</span>
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded truncate max-w-[260px]"
                  style={{ backgroundColor: "white", border: `1px solid ${Z.blueBorder}`, color: Z.blueDark }}
                  title={monitorQuery}
                >
                  {monitorQuery.length > 50 ? monitorQuery.slice(0, 50) + "…" : monitorQuery}
                </span>
                <span style={{ color: Z.textFaint }}>·</span>
                <span style={{ color: Z.textSoft }}>
                  next refresh in <strong style={{ color: Z.text, fontFamily: FONT_HEADING }}>{formatCountdown(secondsToNext)}</strong>
                </span>
              </div>
            ) : (
              <span className="text-sm" style={{ color: Z.textSoft }}>
                Keep your search updating automatically — new matches will appear and highlight.
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: Z.textFaint }}>
              Try:
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuery(s); startSearch(s) }}
                className="text-xs px-3 py-1.5 rounded-full transition-colors hover:bg-white"
                style={{
                  backgroundColor: Z.bgCard,
                  border: `1px solid ${Z.border}`,
                  color: Z.textSoft,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div
            className="rounded-xl p-4 mb-6 text-sm"
            style={{ backgroundColor: "#FEE", border: `1px solid #FBB`, color: Z.red }}
          >
            {error}
          </div>
        )}

        {(streaming || reasoning || listings.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
            <aside
              className="rounded-2xl p-5 sticky top-4 self-start"
              style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: Z.textFaint }}>
                  Assistant reasoning
                </span>
                {streaming && (
                  <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: Z.blue }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: Z.blue }} />
                    live
                  </span>
                )}
                {!streaming && done && (
                  <span className="text-[11px] font-semibold" style={{ color: Z.green }}>done</span>
                )}
              </div>
              <div
                ref={reasoningRef}
                className="text-[13px] whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed"
                style={{ color: Z.textSoft, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {reasoning || (streaming ? "Connecting…" : "Reasoning will stream here.")}
              </div>
            </aside>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: Z.text, fontFamily: FONT_HEADING }}>
                  {listings.length} {listings.length === 1 ? "match" : "matches"}
                  {monitorOn && newIds.size > 0 && (
                    <span className="ml-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: Z.blue }}>
                      +{newIds.size} new this cycle
                    </span>
                  )}
                </span>
                {streaming && (
                  <span className="text-xs font-semibold" style={{ color: Z.blue }}>
                    streaming…
                  </span>
                )}
              </div>
              {listings.length === 0 && streaming && (
                <div
                  className="rounded-xl p-8 text-center text-sm"
                  style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}`, color: Z.textFaint }}
                >
                  Searching the web…
                </div>
              )}
              {listings.map((l, i) => (
                <DemoListingCard key={l.id} l={l} idx={i} city={city} isNew={newIds.has(l.id)} />
              ))}
            </div>
          </div>
        )}

        {!streaming && !reasoning && listings.length === 0 && !error && (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
          >
            <p className="text-base font-semibold mb-2" style={{ color: Z.text, fontFamily: FONT_HEADING }}>
              Pick a suggestion above or type your own.
            </p>
            <p className="text-sm max-w-xl mx-auto leading-relaxed" style={{ color: Z.textSoft }}>
              Each result is returned with the criteria it matched and the source URLs that
              support each claim. Citations are first-class — no hallucinated listings.
            </p>
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-xs" style={{ color: Z.textFaint }}>
        Demo · Not affiliated with Zillow Group, Inc. · Search powered by Parallel
      </footer>
    </div>
  )
}
