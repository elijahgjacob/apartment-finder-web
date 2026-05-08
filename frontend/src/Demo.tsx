import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useAppConfig } from "./config-context"
import { ZillowMap } from "./components/zillow-map"
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

type MonitorStatus = {
  active: boolean
  monitor_id?: string | null
  query?: string
  frequency?: string
  processor?: string
  status?: string
  last_run_at?: string
  created_at?: string
  events_last_24h?: number
}

// ── Icon set ─────────────────────────────────────────────────────────────

const SearchIcon = ({ size = 18, color = Z.textFaint }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
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

function relativeTime(iso?: string): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return "just now"
  const m = Math.floor(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Realistic monthly-rent floors by bed count, San Francisco-area.
// (Used to flag impossible budgets before a search burns API quota.)
const RENT_FLOORS_SF: Record<number, number> = {
  0: 1900,   // studio
  1: 2700,
  2: 3600,
  3: 5200,
  4: 6500,
  5: 8000,
}

const WORD_TO_NUM: Record<string, number> = {
  studio: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
}

function extractBedsFromQuery(query: string): number | null {
  if (/\bstudio\b/i.test(query)) return 0
  const m = query.match(/\b(\d+|one|two|three|four|five|six)\s*[-+]?\s*(?:br|bed|bedroom|bedrooms)\b/i)
  if (!m) return null
  const w = m[1].toLowerCase()
  if (WORD_TO_NUM[w] != null) return WORD_TO_NUM[w]
  const n = parseInt(w)
  return Number.isFinite(n) ? n : null
}

function realisticFloor(beds: number | null): number | null {
  if (beds == null) return null
  return RENT_FLOORS_SF[beds] ?? RENT_FLOORS_SF[Math.min(beds, 5)] ?? null
}

function extractBudgetFromQuery(query: string): number | null {
  // 1. Explicit $-prefixed amount, optional 'k' suffix: "$7000", "$7,500", "$7k", "$7.5k"
  const dollar = query.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(k)?/i)
  if (dollar) {
    let n = parseFloat(dollar[1].replace(/,/g, ""))
    if (dollar[2]) n *= 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  // 2. Contextual phrasing: "under 7000", "below $4500", "max 5k", "up to 6000"
  const ctx = query.match(
    /\b(?:under|below|max(?:imum)?|less\s+than|up\s+to|cheaper\s+than|<=?)\s+\$?([\d,]+(?:\.\d+)?)\s*(k)?\b/i,
  )
  if (ctx) {
    let n = parseFloat(ctx[1].replace(/,/g, ""))
    if (ctx[2]) n *= 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  // 3. Bare 'k' price: "7k", "5.5k a month"
  const kBare = query.match(/(?<![\d$])(\d+(?:\.\d+)?)\s*k\b/i)
  if (kBare) {
    const n = parseFloat(kBare[1]) * 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  return null
}

function defaultBudgetForBeds(beds: number | null): number {
  if (beds == null) return 7500
  // Floor + ~30% headroom so the search has somewhere to land
  const floor = realisticFloor(beds)
  return floor != null ? Math.round(floor * 1.3 / 250) * 250 : 7500
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

function scorePalette(score: number | null | undefined) {
  if (score == null) return { fg: Z.textFaint, bg: Z.bgSubtle, border: Z.border }
  if (score >= 70) return { fg: Z.green, bg: Z.greenSoft, border: "#BAE0C2" }
  if (score >= 45) return { fg: Z.amber, bg: "#FFF4E0", border: "#F7D9A8" }
  return { fg: Z.red, bg: Z.redSoft, border: "#F4B5B5" }
}

function ListingCard({
  l, idx, city, isSessionNew, isFresh, isHovered, onHover, onLeave,
}: {
  l: Listing; idx: number; city: string
  isSessionNew: boolean   // arrived in current SSE stream — strongest visual
  isFresh: boolean        // appeared in DB after lastSeenAt — secondary visual
  isHovered?: boolean
  onHover?: () => void
  onLeave?: () => void
}) {
  const href = l.url ?? `https://www.google.com/search?q=${encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)}`
  const scoreP = scorePalette(l.score)
  const viaMonitor = l.details?.via_monitor === true
  const newish = isSessionNew || isFresh
  return (
    <article
      data-listing-id={l.id}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 ${isSessionNew ? "animate-in fade-in slide-in-from-bottom-3 duration-500" : ""}`}
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${newish || isHovered ? Z.blueBorder : Z.border}`,
        boxShadow: isSessionNew
          ? `0 0 0 4px ${Z.blueSoft}, 0 1px 2px rgba(15,17,21,0.04)`
          : isFresh
            ? `0 0 0 2px ${Z.blueSoft}, 0 1px 2px rgba(15,17,21,0.04)`
            : isHovered
              ? `0 8px 24px rgba(31,69,252,0.12), 0 0 0 1px ${Z.blueBorder}`
              : `0 1px 2px rgba(15,17,21,0.04)`,
        // Subtle accent stripe on the leading edge based on score
        borderLeft: `3px solid ${scoreP.border}`,
      }}
    >
      {/* Top row: pos · neighborhood · source · status */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: Z.bgSubtle, color: Z.textMid }}
        >
          {idx + 1}
        </span>
        {l.neighborhood && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: Z.textMid }}>
            <PinIcon size={10} color={Z.textFaint} />
            {l.neighborhood}
          </span>
        )}
        <span
          className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-[0.08em]"
          style={{ backgroundColor: Z.bgSubtle, color: Z.textMid }}
        >
          {l.source}
        </span>
        {l.score != null && (
          <span
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-[0.08em]"
            style={{ backgroundColor: scoreP.bg, color: scoreP.fg, border: `1px solid ${scoreP.border}` }}
            title="Match score: recency + price fit + distance to reference point"
          >
            {l.score}/100
          </span>
        )}
        {isSessionNew && (
          <span
            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-[0.08em] animate-pulse"
            style={{ backgroundColor: Z.blue, color: "white" }}
            title="Just arrived in this search"
          >
            new
          </span>
        )}
        {!isSessionNew && isFresh && (
          <span
            className="text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-[0.08em]"
            style={{ backgroundColor: Z.blueSoft, color: Z.blueDark, border: `1px solid ${Z.blueBorder}` }}
            title={l.fetched_at ? `Discovered ${relativeTime(l.fetched_at)}` : "New since your last visit"}
          >
            new since last visit
          </span>
        )}
        {viaMonitor && (
          <span
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-[0.08em] inline-flex items-center gap-1"
            style={{ backgroundColor: "#FFF", color: Z.blueDark, border: `1px dashed ${Z.blueBorder}` }}
            title="Discovered automatically by the always-on Parallel Monitor"
          >
            <span style={{ fontSize: "8px" }}>●</span> via monitor
          </span>
        )}
      </div>

      {/* Headline + price */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[18px] font-bold hover:underline block leading-tight flex-1 min-w-0 truncate"
          style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.01em" }}
        >
          {l.address ?? l.title ?? "—"}
        </a>
        <div className="text-right shrink-0">
          <div
            className="text-[26px] font-bold leading-none"
            style={{ color: Z.text, fontFamily: FONT_HEADING, letterSpacing: "-0.025em" }}
          >
            {l.price ? `$${l.price.toLocaleString()}` : "—"}
          </div>
          {l.price && (
            <div className="text-[10px] mt-1 uppercase tracking-wider font-semibold" style={{ color: Z.textFaint }}>
              per month
            </div>
          )}
        </div>
      </div>

      {/* Specs row */}
      <div className="text-sm flex flex-wrap items-center gap-x-2 mb-2" style={{ color: Z.textMid }}>
        <strong style={{ color: Z.text, fontWeight: 600 }}>{l.bedrooms ?? "?"}</strong>
        <span>bd</span>
        {l.bathrooms != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.bathrooms}</strong><span>ba</span></>)}
        {l.sqft != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.sqft.toLocaleString()}</strong><span>sqft</span></>)}
        {l.has_parking && (<><span style={{ color: Z.textFaint }}>·</span><span>parking</span></>)}
        {l.has_laundry && (<><span style={{ color: Z.textFaint }}>·</span><span>laundry</span></>)}
      </div>

      {/* Renter-facing detail row */}
      {(l.details?.available_date || l.details?.lease_term || l.details?.pet_policy || l.details?.utilities_included || l.details?.is_furnished) && (
        <div className="text-[12px] flex flex-wrap gap-x-4 gap-y-1 mb-1" style={{ color: Z.textMid }}>
          {l.details?.available_date && <span><span style={{ color: Z.textFaint }}>Available</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.available_date}</strong></span>}
          {l.details?.lease_term && <span><span style={{ color: Z.textFaint }}>Lease</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.lease_term}</strong></span>}
          {l.details?.pet_policy && <span><span style={{ color: Z.textFaint }}>Pets</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.pet_policy}</strong></span>}
          {l.details?.utilities_included && <span><span style={{ color: Z.textFaint }}>Utilities</span> <strong style={{ color: Z.text, fontWeight: 600 }}>{l.details.utilities_included}</strong></span>}
          {l.details?.is_furnished === true && <span><strong style={{ color: Z.text, fontWeight: 600 }}>Furnished</strong></span>}
        </div>
      )}

      <MatchPills listing={l} />
      <Citations listing={l} />
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

type StepStatus = "pending" | "active" | "done" | "error"

type ProcessStep = {
  id: string
  title: string
  subtitle?: string
  detail?: string
  status: StepStatus
  progress?: { matched: number; total: number }
}

function parseReasoningToSteps(text: string, streaming: boolean, done: boolean): ProcessStep[] {
  const steps: ProcessStep[] = [
    { id: "understand", title: "Understanding your search", status: "pending" },
    { id: "discover", title: "Discovering rental listings", status: "pending" },
    { id: "verify", title: "Verifying matches", status: "pending" },
    { id: "enrich", title: "Extracting structured details", status: "pending" },
    { id: "quality", title: "Spam & quality check", status: "pending" },
    { id: "ready", title: "Ready", status: "pending" },
  ]

  // 1. Understanding — completed once we've parsed the objective
  const objMatch = text.match(/Objective:\s*([^\n]+)/)
  if (objMatch) {
    steps[0].status = "done"
    steps[0].subtitle = objMatch[1].trim()
  }
  const budgetMatch = text.match(/Budget:\s*\$([\d,]+)/)
  const bedsMatch = text.match(/(\d+)\+\s*beds/)
  if (steps[0].subtitle && (budgetMatch || bedsMatch)) {
    const parts: string[] = []
    if (bedsMatch) parts.push(`${bedsMatch[1]}+ beds`)
    if (budgetMatch) parts.push(`under $${budgetMatch[1]}`)
    steps[0].detail = parts.join(" · ")
  }

  // 2. Discovery — active once "Starting entity discovery" appears
  if (/Starting entity discovery/.test(text)) steps[1].status = "active"

  // 3. Verify — pulls live progress numbers (X candidates, Y verified)
  const progressMatches = [...text.matchAll(/Progress:\s*(\d+)\s*candidates,\s*(\d+)\s*verified/g)]
  if (progressMatches.length > 0) {
    steps[1].status = "done"
    steps[2].status = "active"
    const last = progressMatches[progressMatches.length - 1]
    const candidates = parseInt(last[1])
    const verified = parseInt(last[2])
    steps[2].progress = { matched: verified, total: candidates }
    steps[2].subtitle = `${verified} verified · ${candidates} candidates checked`
  }

  // Discovery officially done
  if (/Discovery done/.test(text)) {
    steps[1].status = "done"
    steps[2].status = "done"
    const m = text.match(/Discovery done:\s*(\d+)\s*verified/)
    if (m) steps[2].subtitle = `${m[1]} verified across the web`
  }

  // 4. Enrichment — when "Parsing N matches" appears
  const parsingMatch = text.match(/Parsing\s*(\d+)\s*matches/)
  if (parsingMatch) {
    steps[3].status = "active"
    steps[3].subtitle = `Pulling structured fields from ${parsingMatch[1]} listing pages`
  }

  // 5. Spam scoring
  const spamMatch = text.match(/Spam-scoring\s*(\d+)/)
  if (spamMatch) {
    steps[3].status = "done"
    steps[4].status = "active"
    steps[4].subtitle = `Classifying ${spamMatch[1]} untrusted-source listings`
  }

  // 6. Final
  const savedMatch = text.match(/Done\.\s*(\d+)\s*listings saved/)
  if (savedMatch) {
    for (let i = 0; i < 5; i++) if (steps[i].status !== "error") steps[i].status = "done"
    steps[5].status = "done"
    steps[5].subtitle = `${savedMatch[1]} listings ready for review`
  } else if (done) {
    for (const s of steps) if (s.status === "pending" || s.status === "active") s.status = "done"
    steps[5].status = "done"
  }

  // If we have an error in text
  if (/error|failed/i.test(text) && !done && !streaming) {
    for (const s of steps) if (s.status === "active") s.status = "error"
  }

  return steps
}

function StepDot({ status, streaming }: { status: StepStatus; streaming: boolean }) {
  if (status === "done") {
    return (
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: Z.blue }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    )
  }
  if (status === "active") {
    return (
      <div className="relative w-5 h-5 shrink-0 flex items-center justify-center">
        {streaming && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ backgroundColor: Z.blue }} />
        )}
        <span
          className="relative w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "white", border: `2px solid ${Z.blue}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: Z.blue }} />
        </span>
      </div>
    )
  }
  if (status === "error") {
    return (
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: Z.red }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </div>
    )
  }
  // pending
  return (
    <div
      className="w-5 h-5 rounded-full shrink-0"
      style={{ backgroundColor: Z.bgPage, border: `2px solid ${Z.border}` }}
    />
  )
}

function ProgressMeter({ matched, total }: { matched: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (matched / total) * 100) : 0
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: Z.bgPage }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: Z.blue }}
        />
      </div>
    </div>
  )
}

function ProcessTimeline({ steps, streaming }: { steps: ProcessStep[]; streaming: boolean }) {
  return (
    <ol className="px-5 py-5 space-y-1">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1
        const titleColor =
          s.status === "done" ? Z.text :
          s.status === "active" ? Z.text :
          s.status === "error" ? Z.red : Z.textFaint
        const lineColor = s.status === "done" ? Z.blue : Z.border
        return (
          <li key={s.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-0.5">
              <StepDot status={s.status} streaming={streaming} />
              {!isLast && (
                <div
                  className="w-px flex-1 mt-1 mb-1 transition-colors duration-300"
                  style={{ backgroundColor: lineColor, minHeight: 18 }}
                />
              )}
            </div>
            <div className={`flex-1 pb-${isLast ? 0 : 3}`}>
              <div
                className="text-[13px] font-semibold leading-snug"
                style={{ color: titleColor, fontFamily: FONT_HEADING }}
              >
                {s.title}
              </div>
              {s.subtitle && (
                <div className="text-[12px] mt-0.5 leading-relaxed" style={{ color: Z.textMid }}>
                  {s.subtitle}
                </div>
              )}
              {s.detail && (
                <div className="text-[11px] mt-0.5 italic" style={{ color: Z.textFaint }}>
                  "{s.detail}"
                </div>
              )}
              {s.progress && s.status === "active" && (
                <ProgressMeter matched={s.progress.matched} total={s.progress.total} />
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ReasoningPanel({ reasoning, streaming, done }: { reasoning: string; streaming: boolean; done: boolean }) {
  const [showRaw, setShowRaw] = useState(false)
  const rawRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight
  }, [reasoning, showRaw])

  const steps = useMemo(() => parseReasoningToSteps(reasoning, streaming, done), [reasoning, streaming, done])
  const hasActivity = streaming || reasoning.length > 0 || done

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
              Process
            </div>
          </div>
        </div>
        {streaming && (
          <span className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: Z.blue }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: Z.blue }} />
            </span>
            running
          </span>
        )}
        {!streaming && done && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: Z.greenSoft, color: Z.green }}>
            complete
          </span>
        )}
      </header>

      {hasActivity ? (
        <ProcessTimeline steps={steps} streaming={streaming} />
      ) : (
        <div className="px-5 py-8 text-[13px] text-center" style={{ color: Z.textFaint }}>
          The assistant's process will appear here when you run a search.
        </div>
      )}

      {hasActivity && reasoning.length > 0 && (
        <div className="border-t" style={{ borderColor: Z.borderSoft }}>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="w-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-left transition-colors hover:bg-gray-50"
            style={{ color: Z.textFaint }}
          >
            {showRaw ? "▾ Hide raw log" : "▸ Show raw log"}
          </button>
          {showRaw && (
            <div
              ref={rawRef}
              className="text-[12px] whitespace-pre-wrap max-h-[280px] overflow-y-auto leading-relaxed px-5 pb-4 border-t"
              style={{ color: Z.textSoft, fontFamily: FONT_MONO, borderColor: Z.borderSoft }}
            >
              {reasoning}
            </div>
          )}
        </div>
      )}
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

function MonitorStrip({
  monitor, busy, query, onWatch, onStop,
}: {
  monitor: MonitorStatus | null
  busy: boolean
  query: string
  onWatch: () => void
  onStop: () => void
}) {
  const active = !!monitor?.active
  const watchedQuery = monitor?.query ?? ""
  const queryDiffersFromWatch = active && query.trim().length > 0 && query.trim() !== watchedQuery.trim()
  const queryEmpty = query.trim().length === 0

  return (
    <div
      className="rounded-2xl flex flex-wrap items-center gap-3 px-5 py-4 mb-6 transition-all"
      style={{
        backgroundColor: active ? Z.blueSoft : Z.bgCard,
        border: `1px solid ${active ? Z.blueBorder : Z.border}`,
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        {active ? (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: Z.blue }} />
          </span>
        ) : (
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: Z.textFaint }} />
        )}
        <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: active ? Z.blueDark : Z.textMid }}>
          {active ? "Always-on watch" : "No watch active"}
        </span>
      </div>

      <div className="flex-1 min-w-0 text-sm flex items-center gap-2 flex-wrap" style={{ color: Z.textMid }}>
        {active ? (
          <>
            <span
              className="text-[12px] px-2 py-0.5 rounded truncate max-w-[420px]"
              style={{ backgroundColor: "white", border: `1px solid ${Z.blueBorder}`, color: Z.blueDarker, fontFamily: FONT_HEADING, fontWeight: 600 }}
              title={watchedQuery}
            >
              {watchedQuery.length > 80 ? watchedQuery.slice(0, 80) + "…" : (watchedQuery || "—")}
            </span>
            <span className="text-[12px]" style={{ color: Z.textMid }}>
              every <strong style={{ color: Z.text, fontFamily: FONT_HEADING }}>{monitor?.frequency ?? "—"}</strong>
              {" · "}
              last run <strong style={{ color: Z.text, fontFamily: FONT_HEADING }}>{relativeTime(monitor?.last_run_at)}</strong>
              {monitor?.events_last_24h != null && (
                <>{" · "}<strong style={{ color: Z.text, fontFamily: FONT_HEADING }}>{monitor.events_last_24h}</strong> event{monitor.events_last_24h === 1 ? "" : "s"} in 24h</>
              )}
            </span>
          </>
        ) : (
          <span style={{ color: Z.textMid }}>
            Save a search and Parallel will quietly watch the web for new matches — they appear here as they're found.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {active && (
          <button
            type="button"
            onClick={onStop}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all hover:brightness-110"
            style={{ backgroundColor: "white", color: Z.text, border: `1px solid ${Z.border}`, fontFamily: FONT_HEADING }}
          >
            Stop
          </button>
        )}
        {(queryDiffersFromWatch || (!active && !queryEmpty)) && (
          <button
            type="button"
            onClick={onWatch}
            disabled={busy || queryEmpty}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition-all hover:brightness-110"
            style={{ backgroundColor: Z.blue, fontFamily: FONT_HEADING }}
            title={active ? "Replace the watched query with what's in the search bar" : "Start a Parallel Monitor for this query"}
          >
            {busy ? "Saving…" : (active ? "Watch this instead" : "Watch this query")}
          </button>
        )}
      </div>
    </div>
  )
}

function HiddenScoresToggle({ hiddenCount, showAll, onToggle }: { hiddenCount: number; showAll: boolean; onToggle: () => void }) {
  if (hiddenCount === 0 && !showAll) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full mt-2 py-3 rounded-xl text-sm transition-colors hover:bg-white"
      style={{
        backgroundColor: Z.bgCard,
        border: `1px dashed ${Z.border}`,
        color: Z.textMid,
      }}
    >
      {showAll
        ? <>← <span className="font-semibold">Hide poor-fit results</span> (only show strong fits ≥ 70/100)</>
        : <>Show <strong style={{ color: Z.text }}>{hiddenCount}</strong> hidden {hiddenCount === 1 ? "result" : "results"} below the strong-fit bar →</>
      }
    </button>
  )
}

type ViewMode = "list" | "map"

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: "list", label: "List", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
    )},
    { value: "map", label: "Map", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/></svg>
    )},
  ]
  return (
    <div className="inline-flex p-1 rounded-xl shrink-0" style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}>
      {opts.map((o) => {
        const active = view === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: active ? Z.blue : "transparent",
              color: active ? "white" : Z.textMid,
              fontFamily: FONT_HEADING,
            }}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        )
      })}
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
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const evtRef = useRef<EventSource | null>(null)

  // Backend monitor state — driven by GET /api/monitor.
  const [monitor, setMonitor] = useState<MonitorStatus | null>(null)
  const [monitorBusy, setMonitorBusy] = useState(false)

  const [view, setView] = useState<ViewMode>("list")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const cardListRef = useRef<HTMLDivElement | null>(null)

  // 'New since your last visit' tracking. lastSeenAt persists in
  // localStorage; on first ever visit we initialize to (now - 24h)
  // so the most recent day's finds get the NEW treatment.
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    const stored = window.localStorage.getItem("zillow-demo-lastSeenAt")
    if (stored) {
      const n = parseInt(stored, 10)
      if (Number.isFinite(n)) return n
    }
    return Date.now() - 24 * 3600 * 1000
  })
  const markAllSeen = useCallback(() => {
    const now = Date.now()
    setLastSeenAt(now)
    window.localStorage.setItem("zillow-demo-lastSeenAt", String(now))
  }, [])
  const handleMarkerClick = useCallback((id: string) => {
    setHoveredId(id)
    const el = cardListRef.current?.querySelector(`[data-listing-id="${id}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  // Hydrate from /api/listings on mount + after each search completes, so the
  // demo always shows what's actually in the DB (not just the current session
  // stream). Live-streamed listings retain their match_basis/citations; DB
  // listings just won't have those fields rendered.
  const hydrateFromDb = useCallback(async () => {
    try {
      const res = await fetch("/api/listings")
      if (!res.ok) return
      const data = (await res.json()) as Listing[]
      setListings((prev) => {
        // merge: keep streamed listings (which carry match_basis/citations)
        // and pull in DB rows that aren't already present
        const byId = new Map(prev.map((x) => [x.id, x]))
        for (const row of data) {
          if (!byId.has(row.id)) byId.set(row.id, row)
        }
        return Array.from(byId.values())
      })
      setHydrated(true)
    } catch { /* silent — polling failure is fine */ }
  }, [])

  useEffect(() => {
    hydrateFromDb()
  }, [hydrateFromDb])

  // Refetch shortly after a search wraps so just-saved rows reach the UI.
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(hydrateFromDb, 1500)
    return () => window.clearTimeout(t)
  }, [done, hydrateFromDb])

  // Parse the budget + bed count out of the query as the user types.
  // The effective budget passed to the API is whichever the user typed
  // (e.g. "under $5000"), or a sensible default keyed off bed count.
  const parsedBeds = useMemo(() => extractBedsFromQuery(query), [query])
  const parsedBudget = useMemo(() => extractBudgetFromQuery(query), [query])
  const effectiveBudget = useMemo(
    () => parsedBudget ?? defaultBudgetForBeds(parsedBeds) ?? config?.defaultBudget ?? 7500,
    [parsedBudget, parsedBeds, config?.defaultBudget],
  )

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
        body: JSON.stringify({ query: q, budget: effectiveBudget }),
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
  }, [effectiveBudget, done])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startSearch(query)
  }

  // ── Backend monitor lifecycle ──
  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor")
      if (res.ok) setMonitor(await res.json())
    } catch { /* silent — polling failure is fine */ }
  }, [])

  useEffect(() => {
    fetchMonitor()
    const t = window.setInterval(fetchMonitor, 30_000)
    return () => window.clearInterval(t)
  }, [fetchMonitor])

  // Refresh listings every 30s — picks up new ones the backend Monitor saved.
  useEffect(() => {
    const t = window.setInterval(hydrateFromDb, 30_000)
    return () => window.clearInterval(t)
  }, [hydrateFromDb])

  const watchThisQuery = useCallback(async () => {
    const q = query.trim()
    if (!q) { setError("Type a query first, then save it as the watch."); return }
    setMonitorBusy(true)
    try {
      const res = await fetch("/api/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.detail ?? `HTTP ${res.status}`)
        return
      }
      setMonitor(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "monitor save failed")
    } finally {
      setMonitorBusy(false)
    }
  }, [query])

  const stopBackendMonitor = useCallback(async () => {
    setMonitorBusy(true)
    try {
      await fetch("/api/monitor", { method: "DELETE" })
      await fetchMonitor()
    } finally {
      setMonitorBusy(false)
    }
  }, [fetchMonitor])

  const STRONG_FIT_THRESHOLD = 70

  const sortedListings = useMemo(
    () => [...listings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [listings],
  )

  const [showAllScores, setShowAllScores] = useState(false)
  const visibleListings = useMemo(
    () => showAllScores
      ? sortedListings
      : sortedListings.filter((l) => (l.score ?? 0) >= STRONG_FIT_THRESHOLD),
    [sortedListings, showAllScores],
  )
  const hiddenCount = sortedListings.length - visibleListings.length

  // ── New-since-last-visit derivations ──
  const isNewSinceLastVisit = useCallback((l: Listing) => {
    const t = l.fetched_at ? new Date(l.fetched_at).getTime() : 0
    return t > lastSeenAt
  }, [lastSeenAt])

  const newSinceLastVisitCount = useMemo(
    () => visibleListings.filter(isNewSinceLastVisit).length,
    [visibleListings, isNewSinceLastVisit],
  )

  // Realism check is only meaningful when the user EXPLICITLY typed a budget
  // (not when we're falling back to a default). Otherwise we'd nag every
  // suggestion-chip click that didn't include a price.
  const floor = useMemo(() => realisticFloor(parsedBeds), [parsedBeds])
  const budgetLikelyTooLow = floor != null && parsedBudget != null && parsedBudget < floor

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
            <button
              type="submit"
              disabled={!query.trim()}
              className="px-7 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98] shrink-0"
              style={{ backgroundColor: Z.blue, fontFamily: FONT_HEADING, letterSpacing: "0.01em" }}
            >
              {streaming ? "Searching…" : "Search"}
            </button>
          </form>

          {/* Parsed criteria — visible feedback that the AI extracted intent */}
          {(parsedBeds != null || parsedBudget != null) && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: Z.textFaint }}>
                Parsed
              </span>
              {parsedBeds != null && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: Z.blueSoft, color: Z.blueDarker, border: `1px solid ${Z.blueBorder}` }}
                >
                  {parsedBeds === 0 ? "studio" : `${parsedBeds} bd`}
                </span>
              )}
              {parsedBudget != null ? (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: Z.blueSoft, color: Z.blueDarker, border: `1px solid ${Z.blueBorder}` }}
                >
                  ≤ ${parsedBudget.toLocaleString()}/mo
                </span>
              ) : (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: Z.bgSubtle, color: Z.textMid, border: `1px solid ${Z.border}` }}
                  title="No budget detected in query — using a typical default for this bedroom count"
                >
                  default ${effectiveBudget.toLocaleString()}/mo
                </span>
              )}
            </div>
          )}

          {/* Budget realism warning — only when the user explicitly typed a budget */}
          {budgetLikelyTooLow && floor != null && parsedBeds != null && parsedBudget != null && (
            <div
              className="mt-3 rounded-xl px-4 py-3 flex items-start sm:items-center gap-3 flex-col sm:flex-row"
              style={{ backgroundColor: "#FFF8E1", border: `1px solid #F2D896` }}
            >
              <div className="flex items-start gap-2 flex-1">
                <span className="text-base shrink-0 leading-none mt-0.5" aria-hidden>⚠️</span>
                <div className="text-[13px] leading-relaxed" style={{ color: "#5C4400" }}>
                  <span className="font-bold">Heads up:</span>{" "}
                  Typical{" "}
                  {parsedBeds === 0 ? "studios" : `${parsedBeds}-bedroom rentals`}
                  {" "}in {city} start around{" "}
                  <strong style={{ color: "#3D2D00" }}>${floor.toLocaleString()}/month</strong>.{" "}
                  Your query asks for <strong style={{ color: "#3D2D00" }}>under ${parsedBudget.toLocaleString()}</strong>{" "}
                  — likely zero matches.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Replace any "<= $X / under $X / $X" in the query with the floor.
                  const newQuery = query
                    .replace(/\$\s*[\d,]+(?:\.\d+)?\s*k?/gi, `$${floor.toLocaleString()}`)
                    .replace(/\b(?:under|below|max(?:imum)?|less\s+than|up\s+to|cheaper\s+than)\s+\$?[\d,]+(?:\.\d+)?\s*k?/gi,
                      `under $${floor.toLocaleString()}`)
                  setQuery(newQuery === query ? `${query.trim()} under $${floor.toLocaleString()}` : newQuery)
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: "#5C4400", color: "white", fontFamily: FONT_HEADING }}
              >
                Bump to ${floor.toLocaleString()}
              </button>
            </div>
          )}

          {/* Suggestion chips */}
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: Z.textFaint }}>
              Try
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuery(s); startSearch(s) }}
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
        {/* Backend Monitor strip — reflects /api/monitor */}
        <MonitorStrip
          monitor={monitor}
          busy={monitorBusy}
          query={query}
          onWatch={watchThisQuery}
          onStop={stopBackendMonitor}
        />

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
            {newSinceLastVisitCount > 0 && (
              <div
                className="mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: Z.blueSoft, border: `1px solid ${Z.blueBorder}` }}
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: Z.blue }} />
                </span>
                <span className="text-sm flex-1" style={{ color: Z.blueDarker }}>
                  <strong style={{ fontFamily: FONT_HEADING }}>{newSinceLastVisitCount}</strong> new {newSinceLastVisitCount === 1 ? "listing" : "listings"} since your last visit
                </span>
                <button
                  type="button"
                  onClick={markAllSeen}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-white"
                  style={{ color: Z.blueDark, border: `1px solid ${Z.blueBorder}`, fontFamily: FONT_HEADING, backgroundColor: "white" }}
                >
                  Mark all seen
                </button>
              </div>
            )}

            <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex-1">
                <StatsBar listings={visibleListings} newCount={newIds.size} monitoring={!!monitor?.active} />
              </div>
              <ViewToggle view={view} onChange={setView} />
            </div>

            {view === "list" && (
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
                <ReasoningPanel reasoning={reasoning} streaming={streaming} done={done} />
                <div ref={cardListRef} className="space-y-4">
                  {listings.length === 0 && streaming && (<><Skeleton /><Skeleton /><Skeleton /></>)}
                  {visibleListings.map((l, i) => (
                    <ListingCard
                      key={l.id} l={l} idx={i} city={city}
                      isSessionNew={newIds.has(l.id)}
                      isFresh={!newIds.has(l.id) && isNewSinceLastVisit(l)}
                      isHovered={hoveredId === l.id}
                      onHover={() => setHoveredId(l.id)}
                      onLeave={() => setHoveredId(null)}
                    />
                  ))}
                  <HiddenScoresToggle
                    hiddenCount={hiddenCount}
                    showAll={showAllScores}
                    onToggle={() => setShowAllScores((v) => !v)}
                  />
                </div>
              </div>
            )}

            {view === "map" && (
              <ZillowMap
                listings={visibleListings}
                config={config ?? null}
                hoveredId={hoveredId}
                onMarkerClick={handleMarkerClick}
                height={680}
              />
            )}
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
