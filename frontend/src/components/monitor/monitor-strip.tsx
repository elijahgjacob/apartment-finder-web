"use client"

import { Z, FONT_HEADING } from "@/lib/palette"
import type { MonitorStatus } from "@/types"

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

interface MonitorStripProps {
  monitor: MonitorStatus | null
  busy: boolean
  onStop: () => void
}

export function MonitorStrip({ monitor, busy, onStop }: MonitorStripProps) {
  const active = !!monitor?.active
  const watchedQuery = monitor?.query ?? ""

  if (!active) return null

  return (
    <div
      className="rounded-2xl flex flex-wrap items-center gap-3 px-5 py-3 mb-6 transition-all"
      style={{
        backgroundColor: Z.blueSoft,
        border: `1px solid ${Z.blueBorder}`,
      }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: Z.blue }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: Z.blue }} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: Z.blueDark }}>
          Watching
        </span>
      </div>

      <div className="flex-1 min-w-0 text-sm flex items-center gap-2 flex-wrap" style={{ color: Z.textMid }}>
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
      </div>

      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all hover:brightness-110 shrink-0"
        style={{ backgroundColor: "white", color: Z.text, border: `1px solid ${Z.border}`, fontFamily: FONT_HEADING }}
      >
        {busy ? "Stopping…" : "Stop watching"}
      </button>
    </div>
  )
}
