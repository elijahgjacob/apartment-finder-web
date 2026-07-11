"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { useConfigState } from "@/providers/config-provider"
import { useSearch } from "@/hooks/use-search"
import { useSavedTargets } from "@/hooks/use-saved-targets"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { SearchBar } from "@/components/search/search-bar"
import { SearchStatus } from "@/components/search/search-status"
import { SearchSuggestions } from "@/components/search/search-suggestions"
import { StatsBar } from "@/components/stats/stats-bar"
import { ReasoningPanel } from "@/components/reasoning/reasoning-panel"
import { ListingGrid } from "@/components/listings/listing-grid"
import { Z, FONT_HEADING, FONT_BODY } from "@/lib/palette"
import type { AppConfig, Listing, ViewMode } from "@/types"

const ApartmentMap = dynamic(
  () => import("@/components/map/apartment-map").then((m) => m.ApartmentMap),
  { ssr: false }
)

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

function realisticFloor(beds: number | null, floors: Record<string, number>): number | null {
  if (beds == null) return null
  return floors[String(beds)] ?? floors[String(Math.min(beds, 5))] ?? null
}

function makeIsStale(
  staleness: { aggregatorSources: string[]; aggregatorDays: number; directDays: number },
) {
  const aggregators = new Set(staleness.aggregatorSources)
  return (l: Listing): boolean => {
    const det = l.details ?? {}
    if (det.is_currently_active === false) return true

    const dom = (det as { days_on_market?: number }).days_on_market
    if (typeof dom === "number" && Number.isFinite(dom)) {
      const limit = aggregators.has(l.source) ? staleness.aggregatorDays : staleness.directDays
      return dom > limit
    }

    const referenceTs =
      (det as { monitor_event_date?: string }).monitor_event_date ?? l.fetched_at ?? null
    if (!referenceTs) return false
    const ageDays = (Date.now() - new Date(referenceTs).getTime()) / 86_400_000
    if (!Number.isFinite(ageDays)) return false
    const limit = aggregators.has(l.source) ? staleness.aggregatorDays : staleness.directDays
    return ageDays > limit
  }
}

function extractBudgetFromQuery(query: string): number | null {
  const dollar = query.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(k)?/i)
  if (dollar) {
    let n = parseFloat(dollar[1].replace(/,/g, ""))
    if (dollar[2]) n *= 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  const ctx = query.match(
    /\b(?:under|below|max(?:imum)?|less\s+than|up\s+to|cheaper\s+than|<=?)\s+\$?([\d,]+(?:\.\d+)?)\s*(k)?\b/i,
  )
  if (ctx) {
    let n = parseFloat(ctx[1].replace(/,/g, ""))
    if (ctx[2]) n *= 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  const kBare = query.match(/(?<![\d$])(\d+(?:\.\d+)?)\s*k\b/i)
  if (kBare) {
    const n = parseFloat(kBare[1]) * 1000
    if (n >= 500 && n <= 30000) return Math.round(n)
  }
  return null
}

function defaultBudgetForBeds(beds: number | null, floors: Record<string, number>, fallback: number): number {
  const floor = realisticFloor(beds, floors)
  return floor != null ? Math.round(floor * 1.3 / 250) * 250 : fallback
}

function CenteredScreen({ title, body, color }: { title: string; body: string; color?: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: Z.bgPage, color: Z.text, fontFamily: FONT_BODY }}
    >
      <div className="max-w-md text-center">
        <div className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: color ?? Z.textFaint }}>
          {title}
        </div>
        <p className="text-base leading-relaxed" style={{ color: Z.textMid }}>
          {body}
        </p>
      </div>
    </div>
  )
}

function SparkleIcon({ size = 14, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9z" />
    </svg>
  )
}

export default function DemoApp() {
  const { config, loading, error: configError } = useConfigState()

  if (loading) {
    return <CenteredScreen title="Loading" body="Fetching configuration…" />
  }
  if (configError) {
    return (
      <CenteredScreen
        title="Backend unreachable"
        color={Z.red}
        body={`Couldn't load /api/config — ${configError}. Make sure the FastAPI backend is running and reachable from this origin.`}
      />
    )
  }
  if (!config) {
    return <CenteredScreen title="No config" body="The /api/config response was empty." />
  }
  return <DemoAppInner config={config} />
}

function DemoAppInner({ config }: { config: AppConfig }) {
  const [city, setCity] = useState(config.cityShort)
  const [requirements, setRequirements] = useState("")

  const [view, setView] = useState<ViewMode>("list")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const cardListRef = useRef<HTMLDivElement | null>(null)

  const {
    query, setQuery,
    reasoning, streaming, listings, error, done, phase, startedAt,
    fraudChecking, runFraudCheck,
    startSearch,
  } = useSearch()

  const { saved, isSaved, toggleSave, clearSaved } = useSavedTargets()

  const parsedBeds = useMemo(() => extractBedsFromQuery(query), [query])
  const parsedBudget = useMemo(() => extractBudgetFromQuery(query), [query])
  const effectiveBudget = useMemo(
    () => parsedBudget ?? defaultBudgetForBeds(parsedBeds, config.rentFloors, config.defaultBudget),
    [parsedBudget, parsedBeds, config.rentFloors, config.defaultBudget],
  )

  const isStale = useMemo(() => makeIsStale(config.staleness), [config.staleness])

  const handleMarkerClick = useCallback((id: string) => {
    setHoveredId(id)
    const el = cardListRef.current?.querySelector(`[data-listing-id="${id}"]`)
    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setView("list")
    startSearch(query, effectiveBudget, { city, requirements: requirements || undefined })
  }

  const STRONG_FIT_THRESHOLD = 70
  // Same threshold the original backend used (SPAM_HIDE_THRESHOLD): one
  // canonical scam signal from the Task API secondary check trips it.
  const SPAM_HIDE_THRESHOLD = 50

  const sortedListings = useMemo(
    () => [...listings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [listings],
  )

  const [showAllScores, setShowAllScores] = useState(false)
  const [showStale, setShowStale] = useState(false)
  const [showSpam, setShowSpam] = useState(false)

  const isSpam = useCallback(
    (l: Listing) => (l.spam_score ?? 0) >= SPAM_HIDE_THRESHOLD,
    [SPAM_HIDE_THRESHOLD],
  )

  const filteredListings = useMemo(() => {
    return sortedListings.filter((l) => {
      // While a search is streaming, show every verified card in live time —
      // provisional scores lack proximity/price points until finalize, so the
      // strong-fit bar only applies once the run completes.
      if (!streaming && !showAllScores && (l.score ?? 0) < STRONG_FIT_THRESHOLD) return false
      if (!showStale && isStale(l)) return false
      if (!showSpam && isSpam(l)) return false
      return true
    })
  }, [sortedListings, streaming, showAllScores, showStale, showSpam, isStale, isSpam])

  const hiddenLowScoreCount = useMemo(
    () => streaming ? 0 : sortedListings.filter((l) => (l.score ?? 0) < STRONG_FIT_THRESHOLD && (showStale || !isStale(l)) && (showSpam || !isSpam(l))).length,
    [sortedListings, streaming, showStale, showSpam, isStale, isSpam],
  )
  const hiddenStaleCount = useMemo(
    () => sortedListings.filter((l) => isStale(l) && (showAllScores || (l.score ?? 0) >= STRONG_FIT_THRESHOLD)).length,
    [sortedListings, showAllScores, isStale],
  )
  const hiddenSpamCount = useMemo(
    () => sortedListings.filter((l) => isSpam(l)).length,
    [sortedListings, isSpam],
  )

  const savedSorted = useMemo(
    () => [...saved].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [saved],
  )

  const showingSaved = view === "saved"
  const visibleListings = showingSaved ? savedSorted : filteredListings

  const floor = useMemo(() => realisticFloor(parsedBeds, config.rentFloors), [parsedBeds, config.rentFloors])
  const budgetLikelyTooLow = floor != null && parsedBudget != null && parsedBudget < floor

  const hasActivity = streaming || !!reasoning || listings.length > 0 || saved.length > 0

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: Z.bgPage, color: Z.text, fontFamily: FONT_BODY }}
    >
      <Header config={config} />

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
            Describe what you want like you&apos;d tell a friend. The assistant searches the web,
            verifies every match against your criteria, and returns each result with cited sources —
            no guessing, no hallucinated listings.
          </p>

          <SearchBar
            query={query}
            onQueryChange={setQuery}
            city={city}
            onCityChange={setCity}
            requirements={requirements}
            onRequirementsChange={setRequirements}
            onSubmit={onSubmit}
            streaming={streaming}
          />

          <SearchSuggestions
            suggestions={config.suggestions}
            onSelect={(s) => {
              setQuery(s)
              // Parse budget/beds from the clicked suggestion itself —
              // `effectiveBudget` still reflects the previous query text
              // during this event (state hasn't re-rendered yet).
              const beds = extractBedsFromQuery(s)
              const budget = extractBudgetFromQuery(s)
                ?? defaultBudgetForBeds(beds, config.rentFloors, config.defaultBudget)
              startSearch(s, budget, { city, requirements: requirements || undefined })
            }}
            parsedBeds={parsedBeds}
            parsedBudget={parsedBudget}
            effectiveBudget={effectiveBudget}
            budgetLikelyTooLow={budgetLikelyTooLow}
            floor={floor}
            city={city}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div
            className="rounded-xl p-4 mb-6 text-sm font-medium"
            style={{ backgroundColor: Z.redSoft, border: `1px solid #F4B5B5`, color: Z.red }}
          >
            {error}
          </div>
        )}

        {hasActivity ? (
          <>
            {!showingSaved && (
              <SearchStatus phase={phase} streaming={streaming} startedAt={startedAt} />
            )}
            <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex-1">
                <StatsBar listings={visibleListings} />
              </div>
              {done && listings.some((l) => l.needs_verification) && (
                <button
                  type="button"
                  onClick={() => void runFraudCheck()}
                  disabled={fraudChecking}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 shrink-0 inline-flex items-center gap-2"
                  style={{
                    backgroundColor: Z.bgCard,
                    color: Z.red,
                    border: `1px solid #F4B5B5`,
                    fontFamily: FONT_HEADING,
                  }}
                  title="Second run via the Parallel Task API: verifies fact-based scam signals (off-platform payment, owner abroad, withheld address, no viewings, unusual incentives) on each untrusted-source listing."
                >
                  {fraudChecking ? (
                    <>
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-full animate-spin"
                        style={{ border: `2px solid #F4B5B5`, borderTopColor: Z.red }}
                      />
                      Checking…
                    </>
                  ) : (
                    <>🛡 Run fraud check</>
                  )}
                </button>
              )}
              <ViewToggle view={view} onChange={setView} savedCount={saved.length} />
            </div>

            {showingSaved && (
              <div ref={cardListRef}>
                {savedSorted.length === 0 ? (
                  <div
                    className="rounded-2xl p-8 text-center"
                    style={{ backgroundColor: Z.bgCard, border: `1px dashed ${Z.border}` }}
                  >
                    <p className="text-sm font-semibold mb-1" style={{ color: Z.text }}>No saved targets yet</p>
                    <p className="text-sm" style={{ color: Z.textMid }}>
                      Run a search and hit <strong>Save</strong> on the apartments you want to keep. They&apos;re stored only in this browser.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm" style={{ color: Z.textMid }}>
                        {savedSorted.length} saved {savedSorted.length === 1 ? "target" : "targets"} · kept in this browser only
                      </span>
                      <button
                        type="button"
                        onClick={clearSaved}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                        style={{ color: Z.textMid, border: `1px solid ${Z.border}`, fontFamily: FONT_HEADING }}
                      >
                        Clear all
                      </button>
                    </div>
                    <ListingGrid
                      listings={savedSorted}
                      city={city}
                      isStale={isStale}
                      isSaved={isSaved}
                      onToggleSave={toggleSave}
                      hoveredId={hoveredId}
                      onHover={(id) => setHoveredId(id)}
                      onLeave={() => setHoveredId(null)}
                      streaming={false}
                      hiddenLowScoreCount={0}
                      hiddenStaleCount={0}
                      hiddenSpamCount={0}
                      showAllScores
                      showStale
                      showSpam
                      onToggleScores={() => {}}
                      onToggleStale={() => {}}
                      onToggleSpam={() => {}}
                    />
                  </>
                )}
              </div>
            )}

            {view === "list" && (
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
                <ReasoningPanel reasoning={reasoning} streaming={streaming} done={done} />
                <div ref={cardListRef}>
                  <ListingGrid
                    listings={visibleListings}
                    city={city}
                    isStale={isStale}
                    isSaved={isSaved}
                    onToggleSave={toggleSave}
                    hoveredId={hoveredId}
                    onHover={(id) => setHoveredId(id)}
                    onLeave={() => setHoveredId(null)}
                    streaming={streaming}
                    fraudChecking={fraudChecking}
                    hiddenLowScoreCount={hiddenLowScoreCount}
                    hiddenStaleCount={hiddenStaleCount}
                    hiddenSpamCount={hiddenSpamCount}
                    showAllScores={showAllScores}
                    showStale={showStale}
                    showSpam={showSpam}
                    onToggleScores={() => setShowAllScores((v) => !v)}
                    onToggleStale={() => setShowStale((v) => !v)}
                    onToggleSpam={() => setShowSpam((v) => !v)}
                  />
                </div>
              </div>
            )}

            {view === "map" && (
              <ApartmentMap
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

      <Footer disclaimer={config.brand.disclaimer} />
    </div>
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

function ViewToggle({ view, onChange, savedCount }: { view: ViewMode; onChange: (v: ViewMode) => void; savedCount: number }) {
  const opts: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: "list", label: "List", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
    )},
    { value: "map", label: "Map", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/></svg>
    )},
    { value: "saved", label: savedCount > 0 ? `Saved ${savedCount}` : "Saved", icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
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
