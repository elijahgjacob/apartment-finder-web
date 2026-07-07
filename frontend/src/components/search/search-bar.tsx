"use client"

import { Z, FONT_HEADING } from "@/lib/palette"

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  onSubmit: (e: React.FormEvent) => void
  streaming: boolean
  monitorBusy: boolean
  watchOnSubmit: boolean
  onWatchChange: (v: boolean) => void
}

export function SearchBar({
  query, onQueryChange, onSubmit, streaming, monitorBusy,
  watchOnSubmit, onWatchChange,
}: SearchBarProps) {
  return (
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
