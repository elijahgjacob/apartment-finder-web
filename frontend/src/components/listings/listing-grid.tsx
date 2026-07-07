"use client"

import { Z } from "@/lib/palette"
import { ListingCard } from "./listing-card"
import type { Listing } from "@/types"

interface ListingGridProps {
  listings: Listing[]
  city: string
  newIds: Set<string>
  isNewSinceLastVisit: (l: Listing) => boolean
  isStale: (l: Listing) => boolean
  hoveredId: string | null
  onHover: (id: string) => void
  onLeave: () => void
  streaming: boolean
  hiddenLowScoreCount: number
  hiddenStaleCount: number
  showAllScores: boolean
  showStale: boolean
  onToggleScores: () => void
  onToggleStale: () => void
}

export function ListingGrid({
  listings, city, newIds, isNewSinceLastVisit, isStale,
  hoveredId, onHover, onLeave, streaming,
  hiddenLowScoreCount, hiddenStaleCount,
  showAllScores, showStale, onToggleScores, onToggleStale,
}: ListingGridProps) {
  return (
    <div className="space-y-4">
      {listings.length === 0 && streaming && (<><SkeletonCard /><SkeletonCard /><SkeletonCard /></>)}
      {listings.length === 0 && !streaming && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: Z.bgCard, border: `1px dashed ${Z.border}` }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: Z.text }}>
            No matching listings found
          </p>
          <p className="text-sm" style={{ color: Z.textMid }}>
            Try a broader query, a higher budget, or a different area{city ? ` in ${city}` : ""}.
          </p>
        </div>
      )}
      {listings.map((l, i) => (
        <ListingCard
          key={l.id} l={l} idx={i} city={city}
          isSessionNew={newIds.has(l.id)}
          isFresh={!newIds.has(l.id) && isNewSinceLastVisit(l)}
          stale={isStale(l)}
          isHovered={hoveredId === l.id}
          onHover={() => onHover(l.id)}
          onLeave={onLeave}
        />
      ))}
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <HiddenScoresToggle
          hiddenCount={hiddenLowScoreCount}
          showAll={showAllScores}
          onToggle={onToggleScores}
        />
        <StaleToggle
          hiddenCount={hiddenStaleCount}
          showStale={showStale}
          onToggle={onToggleStale}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
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

function HiddenScoresToggle({ hiddenCount, showAll, onToggle }: { hiddenCount: number; showAll: boolean; onToggle: () => void }) {
  if (hiddenCount === 0 && !showAll) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex-1 py-3 rounded-xl text-sm transition-colors hover:bg-white"
      style={{
        backgroundColor: Z.bgCard,
        border: `1px dashed ${Z.border}`,
        color: Z.textMid,
      }}
    >
      {showAll
        ? <>← <span className="font-semibold">Hide poor-fit results</span> (strong fits only)</>
        : <>Show <strong style={{ color: Z.text }}>{hiddenCount}</strong> below the strong-fit bar →</>
      }
    </button>
  )
}

function StaleToggle({ hiddenCount, showStale, onToggle }: { hiddenCount: number; showStale: boolean; onToggle: () => void }) {
  if (hiddenCount === 0 && !showStale) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex-1 py-3 rounded-xl text-sm transition-colors hover:bg-white"
      style={{
        backgroundColor: Z.bgCard,
        border: `1px dashed ${Z.border}`,
        color: Z.textMid,
      }}
      title="Listings on aggregator sites (Zillow, Apartments.com, etc.) often stay live in the index after the unit has been rented. Hidden by default."
    >
      {showStale
        ? <>← <span className="font-semibold">Re-hide likely-stale aggregator listings</span></>
        : <>Show <strong style={{ color: Z.text }}>{hiddenCount}</strong> likely-stale aggregator {hiddenCount === 1 ? "listing" : "listings"} →</>
      }
    </button>
  )
}
