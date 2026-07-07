"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Z, FONT_HEADING, FONT_MONO } from "@/lib/palette"
import { ProcessTimeline } from "./process-timeline"
import type { ProcessStep } from "@/types"

function parseReasoningToSteps(text: string, streaming: boolean, done: boolean): ProcessStep[] {
  const steps: ProcessStep[] = [
    { id: "understand", title: "Understanding your search", status: "pending" },
    { id: "discover", title: "Discovering rental listings", status: "pending" },
    { id: "verify", title: "Verifying matches", status: "pending" },
    { id: "enrich", title: "Extracting structured details", status: "pending" },
    { id: "quality", title: "Spam & quality check", status: "pending" },
    { id: "ready", title: "Ready", status: "pending" },
  ]

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

  if (/Starting entity discovery/.test(text)) steps[1].status = "active"

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

  if (/Discovery done/.test(text)) {
    steps[1].status = "done"
    steps[2].status = "done"
    const m = text.match(/Discovery done:\s*(\d+)\s*verified/)
    if (m) steps[2].subtitle = `${m[1]} verified across the web`
  }

  const parsingMatch = text.match(/Parsing\s*(\d+)\s*matches/)
  if (parsingMatch) {
    steps[3].status = "active"
    steps[3].subtitle = `Pulling structured fields from ${parsingMatch[1]} listing pages`
  }

  const spamMatch = text.match(/Spam-scoring\s*(\d+)/)
  if (spamMatch) {
    steps[3].status = "done"
    steps[4].status = "active"
    steps[4].subtitle = `Classifying ${spamMatch[1]} untrusted-source listings`
  }

  const savedMatch = text.match(/Done\.\s*(\d+)\s*listings saved/)
  if (savedMatch) {
    for (let i = 0; i < 5; i++) if (steps[i].status !== "error") steps[i].status = "done"
    steps[5].status = "done"
    steps[5].subtitle = `${savedMatch[1]} listings ready for review`
  } else if (done) {
    for (const s of steps) if (s.status === "pending" || s.status === "active") s.status = "done"
    steps[5].status = "done"
  }

  if (/error|failed/i.test(text) && !done && !streaming) {
    for (const s of steps) if (s.status === "active") s.status = "error"
  }

  return steps
}

interface ReasoningPanelProps {
  reasoning: string
  streaming: boolean
  done: boolean
}

export function ReasoningPanel({ reasoning, streaming, done }: ReasoningPanelProps) {
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
          The assistant&apos;s process will appear here when you run a search.
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

function SparkleIcon({ size = 14, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9z" />
    </svg>
  )
}
