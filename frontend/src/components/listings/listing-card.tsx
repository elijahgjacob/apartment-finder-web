"use client"

import { Z, FONT_HEADING } from "@/lib/palette"
import { safeUrl } from "@/lib/utils"
import { MatchPills } from "./match-pills"
import { Citations } from "./citations"
import type { Listing } from "@/types"

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

function scorePalette(score: number | null | undefined) {
  if (score == null) return { fg: Z.textFaint, bg: Z.bgSubtle, border: Z.border }
  if (score >= 70) return { fg: Z.green, bg: Z.greenSoft, border: "#BAE0C2" }
  if (score >= 45) return { fg: Z.amber, bg: "#FFF4E0", border: "#F7D9A8" }
  return { fg: Z.red, bg: Z.redSoft, border: "#F4B5B5" }
}

interface ListingCardProps {
  l: Listing
  idx: number
  city: string
  isSessionNew: boolean
  isFresh: boolean
  stale: boolean
  isHovered?: boolean
  onHover?: () => void
  onLeave?: () => void
}

export function ListingCard({
  l, idx, city, isSessionNew, isFresh, stale, isHovered, onHover, onLeave,
}: ListingCardProps) {
  const searchFallback = `https://www.google.com/search?q=${encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)}`
  const href = safeUrl(l.url, searchFallback)
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
        borderLeft: `3px solid ${scoreP.border}`,
      }}
    >
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
        {stale && (
          <span
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-[0.08em]"
            style={{ backgroundColor: "#FFF4E0", color: "#A66300", border: `1px solid #F7D9A8` }}
            title="May be stale — aggregator listing past freshness window, or API marked it inactive."
          >
            stale?
          </span>
        )}
      </div>

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

      <div className="text-sm flex flex-wrap items-center gap-x-2 mb-2" style={{ color: Z.textMid }}>
        <strong style={{ color: Z.text, fontWeight: 600 }}>{l.bedrooms ?? "?"}</strong>
        <span>bd</span>
        {l.bathrooms != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.bathrooms}</strong><span>ba</span></>)}
        {l.sqft != null && (<><span style={{ color: Z.textFaint }}>·</span><strong style={{ color: Z.text, fontWeight: 600 }}>{l.sqft.toLocaleString()}</strong><span>sqft</span></>)}
        {l.has_parking && (<><span style={{ color: Z.textFaint }}>·</span><span>parking</span></>)}
        {l.has_laundry && (<><span style={{ color: Z.textFaint }}>·</span><span>laundry</span></>)}
      </div>

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

function PinIcon({ size = 12, color = Z.textFaint }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
