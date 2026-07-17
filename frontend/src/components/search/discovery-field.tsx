"use client"

import { Z, FONT_MONO } from "@/lib/palette"
import type { SearchPhase } from "@/hooks/use-search"

// Discovery visualization shown in place of the results grid while FindAll
// runs: a city block of unit cells swept by a scan pulse, where cells lock to
// signal orange as real candidates verify. Counts are live run metrics, the
// animation is compositor-only CSS (see globals.css), so it costs nothing.

const COLS = 12
const ROWS = 5
const CELLS = COLS * ROWS

// Fixed scatter so verified cells light up across the block instead of
// filling row by row. Deterministic: same run state -> same picture.
const SCATTER = (() => {
  const idx = Array.from({ length: CELLS }, (_, i) => i)
  let seed = 47
  for (let i = CELLS - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx
})()

export function DiscoveryField({
  progress, phase,
}: {
  progress: { generated: number; matched: number; ready: number; total: number }
  phase: SearchPhase["key"]
}) {
  const verified = new Set(SCATTER.slice(0, Math.min(progress.matched, CELLS)))
  const label = phase === "extract"
    ? "Extracting details"
    : phase === "finalize"
      ? "Mapping & scoring"
      : "Scanning the web"
  const counts = phase === "extract" && progress.total > 0
    ? `${progress.ready}/${progress.total} ready`
    : `${progress.generated} found · ${progress.matched} verified`

  return (
    <div
      className="relative rounded-[4px] p-6"
      style={{ backgroundColor: Z.bgCard, border: `1px solid ${Z.border}` }}
    >
      {/* signature bracket lines */}
      <span aria-hidden className="absolute top-0 bottom-0 w-px" style={{ left: 12, backgroundColor: Z.border }} />
      <span aria-hidden className="absolute top-0 bottom-0 w-px" style={{ right: 12, backgroundColor: Z.border }} />

      <div className="flex items-center justify-between mb-4 px-3">
        <span
          className="text-[11px] uppercase tracking-[0.1em]"
          style={{ color: Z.textMid, fontFamily: FONT_MONO, fontWeight: 500 }}
        >
          {label}
        </span>
        <span
          className="text-[11px] uppercase tracking-[0.08em] tabular-nums"
          style={{ color: Z.blue, fontFamily: FONT_MONO, fontWeight: 500 }}
        >
          {counts}
        </span>
      </div>

      <div
        className="grid px-3"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 8 }}
        role="img"
        aria-label={`Search in progress: ${counts}`}
      >
        {Array.from({ length: CELLS }, (_, i) => (
          <span
            key={i}
            className={`af-field-cell${verified.has(i) ? " af-verified" : ""}`}
            style={verified.has(i) ? undefined : { animationDelay: `${(i % COLS) * 90 + Math.floor(i / COLS) * 140}ms` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-5 px-3">
        <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: Z.textFaint, fontFamily: FONT_MONO }}>
          Each cell is a candidate unit · orange = verified match
        </span>
        <span className="flex items-center gap-2">
          <img src="/parallel-symbol.svg" alt="" width={12} height={12} style={{ display: "block", opacity: 0.55 }} />
          <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: Z.textFaint, fontFamily: FONT_MONO }}>
            FindAll
          </span>
        </span>
      </div>
    </div>
  )
}
