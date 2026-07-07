"use client"

import { useState } from "react"
import { Z, FONT_HEADING, FONT_BODY } from "@/lib/palette"

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  city: string
  onCityChange: (c: string) => void
  requirements: string
  onRequirementsChange: (r: string) => void
  onSubmit: (e: React.FormEvent) => void
  streaming: boolean
  monitorBusy: boolean
  watchOnSubmit: boolean
  onWatchChange: (v: boolean) => void
}

export function SearchBar({
  query, onQueryChange,
  city, onCityChange,
  requirements, onRequirementsChange,
  onSubmit, streaming, monitorBusy,
  watchOnSubmit, onWatchChange,
}: SearchBarProps) {
  const [showReqs, setShowReqs] = useState(!!requirements)

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {/* City selector row */}
      <div
        className="rounded-xl flex items-center gap-2 px-3 py-2"
        style={{
          backgroundColor: Z.bgCard,
          border: `1px solid ${Z.border}`,
        }}
      >
        <MapPinIcon />
        <input
          type="text"
          placeholder="City (e.g. Austin, TX)"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
          style={{ color: Z.text, fontFamily: FONT_BODY }}
        />
        <button
          type="button"
          onClick={() => setShowReqs(!showReqs)}
          className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
          style={{
            color: showReqs ? Z.blueDark : Z.textMid,
            backgroundColor: showReqs ? Z.blueSoft : "transparent",
            border: `1px solid ${showReqs ? Z.blueBorder : Z.border}`,
            fontFamily: FONT_HEADING,
          }}
        >
          + Requirements
        </button>
      </div>

      {/* Requirements row (collapsible) */}
      {showReqs && (
        <div
          className="rounded-xl px-3 py-2"
          style={{
            backgroundColor: Z.bgCard,
            border: `1px solid ${Z.border}`,
          }}
        >
          <input
            type="text"
            placeholder="Must-haves: e.g. in-unit laundry, pet-friendly, near transit, parking"
            value={requirements}
            onChange={(e) => onRequirementsChange(e.target.value)}
            className="w-full bg-transparent text-sm focus:outline-none"
            style={{ color: Z.text, fontFamily: FONT_BODY }}
          />
        </div>
      )}

      {/* Main search bar */}
      <div
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
            placeholder="Describe what you're looking for..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="flex-1 bg-transparent py-3 text-base focus:outline-none min-w-0"
            style={{ color: Z.text }}
            autoFocus
          />
        </div>
        <label
          className="flex items-center gap-2 px-3 cursor-pointer select-none border-l shrink-0"
          style={{ borderColor: Z.borderSoft }}
          title="When checked, also save this query as the always-on watch. New matching listings will appear automatically over time."
        >
          <input
            type="checkbox"
            checked={watchOnSubmit}
            onChange={(e) => onWatchChange(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
            style={{ accentColor: Z.blue }}
          />
          <span className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: Z.textMid, fontFamily: FONT_HEADING }}>
            Watch
          </span>
        </label>
        <button
          type="submit"
          disabled={!query.trim() || monitorBusy}
          className="px-7 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98] shrink-0"
          style={{ backgroundColor: Z.blue, fontFamily: FONT_HEADING, letterSpacing: "0.01em" }}
        >
          {streaming ? "Searching…" : watchOnSubmit ? "Search & Watch" : "Search"}
        </button>
      </div>
    </form>
  )
}

function SearchIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Z.textFaint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Z.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
