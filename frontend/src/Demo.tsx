import { useState, useRef, useCallback, useEffect } from "react"
import { useAppConfig } from "./config-context"
import type { Listing } from "./types"

// Zillow-ish theme tokens (kept local to this view so the rest of the app's
// dark theme is untouched). Brand blue ~#006AFF; backgrounds ~#FFFFFF/#F4F5F6.
const Z = {
  blue: "#006AFF",
  blueDark: "#0051CC",
  text: "#13192C",
  textSoft: "#54575C",
  textFaint: "#7A7D82",
  bgPage: "#F4F5F6",
  bgCard: "#FFFFFF",
  border: "#E5E7EB",
  green: "#0E8A16",
  amber: "#A66300",
  red: "#B5181E",
}

const SUGGESTIONS = [
  "Quiet 2-bedroom with a yard near a good elementary school under $4500",
  "Pet-friendly studio in SoMa or Mission, available before December, under $3000",
  "3BR with in-unit laundry and parking, walk to Caltrain, under $7000",
  "Furnished 1BR for a 6-month lease, dog-friendly, under $4000",
]

function ZillowLogo() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white text-lg"
        style={{ backgroundColor: Z.blue, fontFamily: "system-ui, sans-serif" }}
      >
        Z
      </div>
      <div className="leading-tight">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: Z.textSoft }}>
          AI Search
        </div>
        <div className="text-[10px]" style={{ color: Z.textFaint }}>
          Demo · Powered by Parallel
        </div>
      </div>
    </div>
  )
}

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
              backgroundColor: ok ? "#E6F0FF" : "#F4F5F6",
              color: ok ? Z.blueDark : Z.textFaint,
              border: `1px solid ${ok ? "#C2D9FF" : Z.border}`,
            }}
          >
            <span style={{ color: ok ? Z.blue : Z.textFaint }}>{ok ? "✓" : "·"}</span>
            <span className="font-medium">{m.name.replaceAll("_", " ")}</span>
            {m.value && (
              <span style={{ color: ok ? Z.text : Z.textFaint, opacity: 0.85 }}>
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
            style={{ color: Z.blueDark }}
            title={c.title}
          >
            [{i + 1}] {host}
          </a>
        )
      })}
    </div>
  )
}

function DemoListingCard({ l, idx, city }: { l: Listing; idx: number; city: string }) {
  const href = l.url ?? `https://www.google.com/search?q=${encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)}`
  return (
    <article
      className="rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-5"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-semibold w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: Z.blue, color: "white" }}
            >
              {idx + 1}
            </span>
            {l.neighborhood && (
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: Z.textFaint }}>
                {l.neighborhood}
              </span>
            )}
            <span
              className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: Z.bgPage, color: Z.textSoft }}
            >
              {l.source}
            </span>
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold hover:underline block leading-snug"
            style={{ color: Z.text }}
          >
            {l.address ?? l.title ?? "—"}
          </a>
          <div className="text-sm mt-1.5 flex flex-wrap items-center gap-x-2" style={{ color: Z.textSoft }}>
            <strong style={{ color: Z.text }}>{l.bedrooms ?? "?"}</strong>
            <span>bd</span>
            {l.bathrooms != null && (<><span>·</span><strong style={{ color: Z.text }}>{l.bathrooms}</strong><span>ba</span></>)}
            {l.sqft != null && (<><span>·</span><strong style={{ color: Z.text }}>{l.sqft.toLocaleString()}</strong><span>ft²</span></>)}
            {l.has_parking && (<><span>·</span><span>parking</span></>)}
            {l.has_laundry && (<><span>·</span><span>laundry</span></>)}
          </div>
          {(l.details?.available_date || l.details?.lease_term || l.details?.pet_policy) && (
            <div className="text-[12px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: Z.textSoft }}>
              {l.details?.available_date && <span><span style={{ color: Z.textFaint }}>Available:</span> <strong style={{ color: Z.text }}>{l.details.available_date}</strong></span>}
              {l.details?.lease_term && <span><span style={{ color: Z.textFaint }}>Lease:</span> <strong style={{ color: Z.text }}>{l.details.lease_term}</strong></span>}
              {l.details?.pet_policy && <span><span style={{ color: Z.textFaint }}>Pets:</span> <strong style={{ color: Z.text }}>{l.details.pet_policy}</strong></span>}
            </div>
          )}
          <MatchPills listing={l} />
          <Citations listing={l} />
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold" style={{ color: Z.text }}>
            {l.price ? `$${l.price.toLocaleString()}` : "—"}
          </div>
          {l.price && (
            <div className="text-[11px] -mt-0.5" style={{ color: Z.textFaint }}>per month</div>
          )}
          {l.score != null && (
            <div className="mt-2 text-[10px] uppercase font-semibold tracking-wider" style={{ color: Z.blueDark }}>
              {l.score} / 100
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Demo() {
  const config = useAppConfig()
  const city = config?.cityShort ?? "San Francisco"
  const [query, setQuery] = useState("")
  const [budget, setBudget] = useState<number>(config?.defaultBudget ?? 7500)
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const evtRef = useRef<EventSource | null>(null)
  const reasoningRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (config?.defaultBudget && budget === 7500) setBudget(config.defaultBudget)
  }, [config?.defaultBudget, budget])

  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight
    }
  }, [reasoning])

  const startSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    evtRef.current?.close()
    setReasoning("")
    setListings([])
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
        setListings((p) => (p.find((x) => x.id === d.listing.id) ? p : [...p, d.listing]))
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
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: Z.bgPage,
        color: Z.text,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <header className="bg-white border-b" style={{ borderColor: Z.border }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <ZillowLogo />
          <a
            href="/"
            className="text-xs font-semibold hover:underline"
            style={{ color: Z.blueDark }}
          >
            ← back to listings
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <section className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-3" style={{ color: Z.text }}>
            Find your home in your own words.
          </h1>
          <p className="text-base mb-6 max-w-2xl" style={{ color: Z.textSoft }}>
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
              disabled={streaming}
              autoFocus
            />
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
              step={250}
              min={500}
              max={30000}
              disabled={streaming}
              className="bg-transparent px-3 py-3 w-32 text-base font-semibold text-right focus:outline-none border-l"
              style={{ color: Z.text, borderColor: Z.border }}
              title="Max monthly rent"
            />
            <button
              type="submit"
              disabled={streaming || !query.trim()}
              className="px-6 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 transition-colors hover:brightness-110"
              style={{ backgroundColor: Z.blue }}
            >
              {streaming ? "Searching…" : "Search"}
            </button>
          </form>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: Z.textFaint }}>
              Try:
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={streaming}
                onClick={() => { setQuery(s); startSearch(s) }}
                className="text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
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
                {done && (
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
                <span className="text-sm font-semibold" style={{ color: Z.text }}>
                  {listings.length} {listings.length === 1 ? "match" : "matches"}
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
                <DemoListingCard key={l.id} l={l} idx={i} city={city} />
              ))}
            </div>
          </div>
        )}

        {!streaming && !reasoning && listings.length === 0 && !error && (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
          >
            <p className="text-base font-medium mb-2" style={{ color: Z.text }}>
              Pick a suggestion above or type your own.
            </p>
            <p className="text-sm max-w-xl mx-auto" style={{ color: Z.textSoft }}>
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
