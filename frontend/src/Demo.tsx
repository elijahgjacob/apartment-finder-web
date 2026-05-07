import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useAppConfig } from "./config-context"
import type { Listing } from "./types"

// Brand-blue tuned to match the Zillow lockup. Deep, vibrant.
const Z = {
  blue: "#1F45FC",
  blueDark: "#1736C7",
  blueDarker: "#0D1F8A",
  blueSoft: "#EEF1FF",
  blueSofter: "#F7F9FF",
  blueBorder: "#C7D2FF",
  text: "#0E1117",
  textSoft: "#3D434D",
  textMid: "#5C6370",
  textFaint: "#8B919E",
  bgPage: "#F7F8FA",
  bgCard: "#FFFFFF",
  bgSubtle: "#F2F4F7",
  border: "#E4E7EC",
  borderSoft: "#EFF1F5",
  green: "#137333",
  greenSoft: "#E6F4EA",
  amber: "#C77700",
  red: "#C62828",
  redSoft: "#FCE8E8",
}

const FONT_HEADING = "'Geist Variable', 'Geist', system-ui, sans-serif"
const FONT_BODY = "'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

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

// ── Icon set ─────────────────────────────────────────────────────────────

const SearchIcon = ({ size = 18, color = Z.textFaint }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
)

const HouseIcon = ({ size = 56, color = Z.textFaint }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 28 32 8l24 20" />
    <path d="M14 26v28h36V26" />
    <path d="M26 54V36h12v18" />
  </svg>
)

const CheckIcon = ({ size = 11, color = Z.blue }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const SparkleIcon = ({ size = 14, color = "white" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9z" />
  </svg>
)

const PinIcon = ({ size = 12, color = Z.textFaint }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`
}

function imageGradient(id: string): string {
  // Deterministic neutral gradient per listing — soft, professional palette
  // (avoids garish hues that would clash with brand). Cycles through 6 muted
  // pairs that feel like dawn / dusk over a city skyline.
  const palette = [
    ["#E8F0FE", "#C9D7F5"], // sky
    ["#F0E9F8", "#D4C5E8"], // dusk
    ["#E6F1ED", "#B9D4C7"], // sage
    ["#FBE9E2", "#F2C9B5"], // peach
    ["#EAEEF4", "#C4CCD8"], // slate
    ["#F4EFE6", "#D9C9AE"], // sand
  ]
  const idx = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
  const [a, b] = palette[idx]
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}

function avgPrice(listings: Listing[]): number | null {
  const priced = listings.filter((l) => l.price)
  if (priced.length === 0) return null
  return Math.round(priced.reduce((sum, l) => sum + (l.price ?? 0), 0) / priced.length)
}

// ── Sub-components ───────────────────────────────────────────────────────

function MatchPills({ listing }: { listing: Listing }) {
  if (!listing.match_basis?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {listing.match_basis.map((m) => {
        const ok = m.matched
        return (
          <span
            key={m.name}
            className="text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{
              backgroundColor: ok ? Z.blueSoft : Z.bgSubtle,
              color: ok ? Z.blueDarker : Z.textFaint,
              border: `1px solid ${ok ? Z.blueBorder : Z.borderSoft}`,
              fontWeight: 500,
            }}
          >
            {ok ? <CheckIcon size={10} color={Z.blue} /> : <span style={{ color: Z.textFaint, fontWeight: 700 }}>·</span>}
            <span>{m.name.replaceAll("_", " ")}</span>
            {m.value && (
              <span style={{ color: ok ? Z.text : Z.textFaint, opacity: 0.85, fontWeight: 400 }}>
                — {m.value.length > 28 ? m.value.slice(0, 28) + "…" : m.value}
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
    <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderColor: Z.borderSoft }}>
      <span className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: Z.textFaint }}>
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
            className="text-[11px] hover:underline truncate max-w-[260px] inline-flex items-center gap-1"
            style={{ color: Z.blueDark, fontWeight: 500 }}
            title={c.title}
          >
            <span className="text-[9px] px-1 rounded" style={{ backgroundColor: Z.blueSoft, color: Z.blueDarker, fontWeight: 700 }}>
              {i + 1}
            </span>
            {host}
          </a>
        )
      })}
    </div>
  )
}

function ListingCard({ l, idx, city, isNew }: { l: Listing; idx: number; city: string; isNew: boolean }) {
  const href = l.url ?? `https://www.google.com/search?q=${encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)}`
  return (
    <article
      className={`group rounded-2xl overflow-hidden flex flex-col sm:flex-row transition-all duration-200 hover:-translate-y-0.5 ${isNew ? "animate-in fade-in slide-in-from-bottom-3 duration-500" : ""}`}
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${isNew ? Z.blueBorder : Z.border}`,
        boxShadow: isNew
          ? `0 0 0 4px ${Z.blueSoft}, 0 1px 2px rgba(15,17,21,0.04)`
          : `0 1px 2px rgba(15,17,21,0.04), 0 0 0 1px rgba(15,17,21,0.01)`,
      }}
    >
      {/* Visual block (placeholder: deterministic gradient + house icon) */}
      <div
        className="relative w-full sm:w-44 h-32 sm:h-auto shrink-0 flex items-center justify-center"
        style={{ background: imageGradient(l.id) }}
      >
        <HouseIcon size={48} color="rgba(0,0,0,0.18)" />
        <span
          className="absolute top-2 left-2 text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "white", color: Z.text, boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
        >
          {idx + 1}
        </span>
        {isNew && (
          <span
            className="absolute top-2 right-2 text-[9px] uppercase font-bold px-2 py-0.5 rounded animate-pulse"
            style={{ backgroundColor: Z.blue, color: "white", letterSpacing: "0.08em" }}
          >
            new
          </span>
        )}
        {l.score != null && (
          <span
            className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: Z.blueDarker, letterSpacing: "0.04em" }}
          >
            {l.score}/100
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {l.neighborhood && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: Z.textMid }}>
                  <PinIcon size={10} color={Z.textFaint} />
                  {l.neighborhood}
                </span>
              )}
              <span
                className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider"
                style={{ backgroundColor: Z.bgSubtle, color: Z.textMid }}
              >
                {l.source}
              </span>
            </div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[17px] font-bold hover:underline block leading-tight"
              style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.01em" }}
            >
              {l.address ?? l.title ?? "—"}
            </a>
            <div className="text-sm mt-2 flex flex-wrap items-center gap-x-2" style={{ color: Z.textMid }}>
              <strong style={{ color: Z.text, fontWeight: 600 }}>{l.bedrooms ?? "?"}</strong>
              <span>bd</span>
              {l.bathrooms != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.bathrooms}</strong><span>ba</span></>)}
              {l.sqft != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.sqft.toLocaleString()}</strong><span>sqft</span></>)}
              {l.has_parking && (<><span style={{ color: Z.textFaint }}>·</span><span>parking</span></>)}
              {l.has_laundry && (<><span style={{ color: Z.textFaint }}>·</span><span>laundry</span></>)}
            </div>
            {(l.details?.available_date || l.details?.lease_term || l.details?.pet_policy) && (
              <div className="text-[12px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: Z.textMid }}>
                {l.details?.available_date && <span><span style={{ color: Z.textFaint }}>Available:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.available_date}</strong></span>}
                {l.details?.lease_term && <span><span style={{ color: Z.textFaint }}>Lease:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.lease_term}</strong></span>}
                {l.details?.pet_policy && <span><span style={{ color: Z.textFaint }}>Pets:</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.pet_policy}</strong></span>}
              </div>
            )}
            <MatchPills listing={l} />
            <Citations listing={l} />
          </div>
          <div className="text-right shrink-0">
            <div
              className="text-[28px] font-bold leading-none"
              style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.025em" }}
            >
              {l.price ? `$${l.price.toLocaleString()}` : "—"}
            </div>
            {l.price && (
              <div className="text-[11px] mt-1" style={{ color: Z.textFaint }}>per month</div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function StatsBar({ listings, newCount, monitoring }: { listings: Listing[]; newCount: number; monitoring: boolean }) {
  const avg = avgPrice(listings)
  const min = listings.reduce((m, l) => (l.price && (m == null || l.price < m) ? l.price : m), null as number | null)
  const high = listings.filter((l) => (l.score ?? 0) >= 70).length
  return (
    <div
      className="rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      <Stat label="Matches" value={`${listings.length}`} accent />
      {high > 0 && <Stat label="Strong fit" value={`${high}`} color={Z.green} />}
      {avg != null && <Stat label="Avg rent" value={`$${avg.toLocaleString()}`} />}
      {min != null && <Stat label="Lowest" value={`$${min.toLocaleString()}`} />}
      {monitoring && newCount > 0 && (
        <Stat label="New this cycle" value={`+${newCount}`} accent />
      )}
    </div>
  )
}

function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: Z.textFaint }}>
        {label}
      </span>
      <span
        className="text-lg font-bold leading-none"
        style={{ color: color ?? (accent ? Z.blue : Z.text), fontFamily: FONT_HEADING, letterSpacing: "-0.02em" }}
      >
        {value}
      </span>
    </div>
  )
}

function ReasoningPanel({ reasoning, streaming, done }: { reasoning: string; streaming: boolean; done: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [reasoning])

  return (
    <aside
      className="rounded-2xl overflow-hidden sticky top-4 self-start"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      <header
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: Z.borderSoft, backgroundColor: Z.blueSofter }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: Z.blue }}
          >
            <SparkleIcon />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-bold" style={{ color: Z.text, fontFamily: FONT_HEADING }}>
              AI Assistant
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: Z.textFaint }}>
              Reasoning
            </div>
          </div>
        </div>
        {streaming && (
          <span className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: Z.blue }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: Z.blue }} />
            </span>
            live
          </span>
        )}
        {!streaming && done && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: Z.greenSoft, color: Z.green }}>
            done
          </span>
        )}
      </header>
      <div
        ref={ref}
        className="text-[13px] whitespace-pre-wrap max-h-[640px] overflow-y-auto leading-relaxed px-5 py-4"
        style={{ color: Z.textSoft, fontFamily: FONT_MONO }}
      >
        {reasoning || (streaming ? "Connecting to assistant…" : "The assistant's step-by-step reasoning will appear here.")}
      </div>
    </aside>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-2xl p-5 text-left"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] font-bold mb-1.5" style={{ color: Z.blue }}>
        Built-in
      </div>
      <h3 className="text-base font-bold mb-1" style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: Z.textMid }}>{body}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div
      className="rounded-2xl flex flex-col sm:flex-row overflow-hidden"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      <div
        className="w-full sm:w-44 h-32 sm:h-auto shrink-0 animate-pulse"
        style={{ backgroundColor: Z.bgSubtle }}
      />
      <div className="flex-1 p-5 space-y-3">
        <div className="h-3 w-24 rounded animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
        <div className="h-5 w-3/4 rounded animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
        <div className="h-4 w-1/2 rounded animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
          <div className="h-5 w-24 rounded-full animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
          <div className="h-5 w-16 rounded-full animate-pulse" style={{ backgroundColor: Z.bgSubtle }} />
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────

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

  const [monitorOn, setMonitorOn] = useState(false)
  const [monitorInterval, setMonitorInterval] = useState(300)
  const [monitorQuery, setMonitorQuery] = useState<string>("")
  const [secondsToNext, setSecondsToNext] = useState<number>(0)
  const monitorTimerRef = useRef<number | null>(null)
  const monitorTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (config?.defaultBudget && budget === 7500) setBudget(config.defaultBudget)
  }, [config?.defaultBudget, budget])

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
        if (!done) setError("Connection lost")
      }
    } catch (err) {
      setStreaming(false)
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [budget, done])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startSearch(query, { keepListings: monitorOn })
    if (monitorOn) setMonitorQuery(query)
  }

  const stopMonitor = useCallback(() => {
    if (monitorTimerRef.current) { window.clearInterval(monitorTimerRef.current); monitorTimerRef.current = null }
    if (monitorTickRef.current) { window.clearInterval(monitorTickRef.current); monitorTickRef.current = null }
    setMonitorOn(false)
    setMonitorQuery("")
    setSecondsToNext(0)
  }, [])

  const startMonitor = useCallback(() => {
    const q = query.trim()
    if (!q) { setError("Type a query first, then start monitoring."); return }
    setMonitorQuery(q)
    setMonitorOn(true)
    setSecondsToNext(monitorInterval)
    if (!streaming) startSearch(q, { keepListings: true })
    if (monitorTimerRef.current) window.clearInterval(monitorTimerRef.current)
    if (monitorTickRef.current) window.clearInterval(monitorTickRef.current)
    monitorTimerRef.current = window.setInterval(() => {
      startSearch(q, { keepListings: true })
      setSecondsToNext(monitorInterval)
    }, monitorInterval * 1000)
    monitorTickRef.current = window.setInterval(() => {
      setSecondsToNext((s) => (s > 0 ? s - 1 : monitorInterval))
    }, 1000)
  }, [query, monitorInterval, startSearch, streaming])

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

  useEffect(() => () => { stopMonitor() }, [stopMonitor])

  const sortedListings = useMemo(
    () => [...listings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [listings],
  )

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: Z.bgPage, color: Z.text, fontFamily: FONT_BODY }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-20 backdrop-blur"
        style={{ backgroundColor: "rgba(255,255,255,0.92)", borderBottom: `1px solid ${Z.border}` }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/zillow-logo.png" alt="Zillow" className="h-7 w-auto" />
            <span
              className="hidden sm:inline-flex items-center gap-1.5 pl-4 border-l text-xs font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: Z.border, color: Z.textMid }}
            >
              <SparkleIcon size={11} color={Z.blue} />
              AI Search
            </span>
          </div>
          <a
            href="/"
            className="text-xs font-bold hover:underline"
            style={{ color: Z.blueDark }}
          >
            ← back to listings
          </a>
        </div>
      </header>

      {/* Hero / search */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `radial-gradient(1100px 480px at 70% -10%, ${Z.blueSoft} 0%, ${Z.bgPage} 70%)`,
          borderBottom: `1px solid ${Z.borderSoft}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5"
            style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}>
            <SparkleIcon size={12} color={Z.blue} />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: Z.blueDark }}>
              Powered by Parallel
            </span>
          </div>
          <h1
            className="font-bold mb-4 max-w-3xl"
            style={{
              fontFamily: FONT_HEADING,
              color: Z.text,
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Find your home in your own words.
          </h1>
          <p className="text-base sm:text-lg mb-7 max-w-2xl leading-relaxed" style={{ color: Z.textMid }}>
            Describe what you want like you'd tell a friend. The assistant searches the web,
            verifies every match against your criteria, and returns each result with cited sources —
            no guessing, no hallucinated listings.
          </p>

          {/* Search bar */}
          <form
            onSubmit={onSubmit}
            className="rounded-2xl flex flex-col sm:flex-row gap-2 p-2"
            style={{
              backgroundColor: Z.bgCard,
              border: `1px solid ${Z.border}`,
              boxShadow: "0 4px 20px rgba(15,17,21,0.06), 0 1px 3px rgba(15,17,21,0.04)",
            }}
          >
            <div className="flex-1 flex items-center px-3 gap-2 min-w-0">
              <SearchIcon />
              <input
                type="text"
                placeholder={`"Quiet 3BR with parking and laundry near Caltrain, available December, under $7000"`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent py-3 text-base focus:outline-none min-w-0"
                style={{ color: Z.text }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
                step={250}
                min={500}
                max={30000}
                className="bg-transparent px-3 py-3 w-28 text-base font-semibold text-right focus:outline-none border-l"
                style={{ color: Z.text, borderColor: Z.borderSoft, fontFamily: FONT_HEADING }}
                title="Max monthly rent"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="px-7 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98] shrink-0"
                style={{ backgroundColor: Z.blue, fontFamily: FONT_HEADING, letterSpacing: "0.01em" }}
              >
                {streaming ? "Searching…" : "Search"}
              </button>
            </div>
          </form>

          {/* Suggestion chips */}
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: Z.textFaint }}>
              Try
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuery(s); startSearch(s, { keepListings: monitorOn }) }}
                className="text-xs px-3 py-1.5 rounded-full transition-all hover:-translate-y-0.5 hover:shadow-sm"
                style={{
                  backgroundColor: Z.bgCard,
                  border: `1px solid ${Z.border}`,
                  color: Z.textSoft,
                  fontWeight: 500,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Live Monitor strip */}
        <div
          className="rounded-2xl flex flex-wrap items-center gap-3 px-5 py-4 mb-6 transition-all"
          style={{
            backgroundColor: monitorOn ? Z.blueSoft : Z.bgCard,
            border: `1px solid ${monitorOn ? Z.blueBorder : Z.border}`,
          }}
        >
          <button
            type="button"
            onClick={monitorOn ? stopMonitor : startMonitor}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: monitorOn ? Z.red : Z.blue,
              color: "white",
              fontFamily: FONT_HEADING,
            }}
          >
            {monitorOn ? "■  Stop monitoring" : "●  Start live monitor"}
          </button>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: Z.textFaint }}>
              Refresh
            </label>
            <select
              value={monitorInterval}
              onChange={(e) => setMonitorInterval(parseInt(e.target.value))}
              className="bg-white border rounded-lg px-2.5 py-1.5 text-sm font-semibold cursor-pointer"
              style={{ color: Z.text, borderColor: Z.border, fontFamily: FONT_HEADING }}
            >
              {MONITOR_INTERVALS.map((m) => (
                <option key={m.seconds} value={m.seconds}>{m.label}</option>
              ))}
            </select>
          </div>
          {monitorOn ? (
            <div className="text-sm flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: Z.blue }} />
              </span>
              <span style={{ color: Z.text }}>Watching</span>
              <span
                className="font-mono text-[11px] px-2 py-0.5 rounded truncate max-w-[280px]"
                style={{ backgroundColor: "white", border: `1px solid ${Z.blueBorder}`, color: Z.blueDarker }}
                title={monitorQuery}
              >
                {monitorQuery.length > 60 ? monitorQuery.slice(0, 60) + "…" : monitorQuery}
              </span>
              <span style={{ color: Z.textFaint }}>·</span>
              <span style={{ color: Z.textSoft }}>
                next refresh in <strong style={{ color: Z.text, fontFamily: FONT_HEADING }}>{formatCountdown(secondsToNext)}</strong>
              </span>
            </div>
          ) : (
            <span className="text-sm" style={{ color: Z.textMid }}>
              Keep your search alive — new matches will appear and highlight automatically.
            </span>
          )}
        </div>

        {error && (
          <div
            className="rounded-xl p-4 mb-6 text-sm font-medium"
            style={{ backgroundColor: Z.redSoft, border: `1px solid #F4B5B5`, color: Z.red }}
          >
            {error}
          </div>
        )}

        {(streaming || reasoning || listings.length > 0) ? (
          <>
            <div className="mb-4">
              <StatsBar listings={sortedListings} newCount={newIds.size} monitoring={monitorOn} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
              <ReasoningPanel reasoning={reasoning} streaming={streaming} done={done} />
              <div className="space-y-4">
                {listings.length === 0 && streaming && (
                  <>
                    <Skeleton /><Skeleton /><Skeleton />
                  </>
                )}
                {sortedListings.map((l, i) => (
                  <ListingCard key={l.id} l={l} idx={i} city={city} isNew={newIds.has(l.id)} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <FeatureCard
              title="Cited every time"
              body="Every fact comes back with the source URLs that support it. No hallucinated listings, no made-up addresses."
            />
            <FeatureCard
              title="Verified match conditions"
              body="The assistant checks each listing against your criteria one-by-one and shows you which conditions matched — and which didn't."
            />
            <FeatureCard
              title="Live monitor"
              body="Lock in a search and let it run. New listings stream in automatically and highlight themselves as they arrive."
            />
          </section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: Z.textFaint }}>
          <span className="font-bold">Demo</span>
          <span>·</span>
          <span>Not affiliated with Zillow Group, Inc.</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">Search powered by <a href="https://parallel.ai" target="_blank" rel="noopener noreferrer" className="hover:underline font-semibold" style={{ color: Z.blueDark }}>Parallel</a></span>
        </div>
      </footer>
    </div>
  )
}
