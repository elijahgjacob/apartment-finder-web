"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Z, FONT_HEADING, FONT_BODY, FONT_MONO } from "@/lib/palette"
import type { AppConfig } from "@/types"

/* ── Shared typography ──────────────────────────────────────────────── */

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{ fontFamily: FONT_HEADING, fontSize: "2.75rem", lineHeight: 1.05, letterSpacing: "-0.03em", color: Z.text, fontWeight: 700, margin: 0 }}>
      {children}
    </h1>
  )
}

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontFamily: FONT_HEADING,
        fontSize: "1.5rem",
        letterSpacing: "-0.02em",
        color: Z.text,
        fontWeight: 700,
        marginTop: "3rem",
        marginBottom: "0.75rem",
        scrollMarginTop: "5rem",
      }}
    >
      {children}
    </h2>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: FONT_HEADING, fontSize: "1.05rem", color: Z.text, fontWeight: 700, letterSpacing: "-0.005em", marginTop: "2rem", marginBottom: "0.5rem" }}>
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: Z.textSoft, lineHeight: 1.7, marginTop: "0.5rem", marginBottom: "1rem", fontSize: "0.95rem" }}>{children}</p>
}

function Pill({ children, color = Z.blueDark, bg = Z.blueSoft, border = Z.blueBorder }: { children: React.ReactNode; color?: string; bg?: string; border?: string }) {
  return (
    <span style={{ backgroundColor: bg, color, border: `1px solid ${border}`, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: FONT_HEADING, letterSpacing: "0.02em" }}>
      {children}
    </span>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ backgroundColor: Z.bgSubtle, color: Z.text, padding: "1px 6px", borderRadius: 4, fontSize: "0.85em", fontFamily: FONT_MONO }}>
      {children}
    </code>
  )
}

function Block({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${Z.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        overflow: "auto",
        fontSize: 12.5,
        lineHeight: 1.6,
        color: Z.textSoft,
        fontFamily: FONT_MONO,
      }}
    >
      {children}
    </pre>
  )
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        backgroundColor: Z.bgCard,
        borderTop: `1px solid ${Z.border}`,
        borderRight: `1px solid ${Z.border}`,
        borderBottom: `1px solid ${Z.border}`,
        borderLeft: accent ? `3px solid ${accent}` : `1px solid ${Z.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: "1rem",
      }}
    >
      {children}
    </div>
  )
}

/* ── Tabs ────────────────────────────────────────────────────────────── */

type TabId = "architecture" | "api-calls" | "configuration"
const TABS: { id: TabId; label: string }[] = [
  { id: "architecture", label: "Architecture" },
  { id: "api-calls", label: "Live API Calls" },
  { id: "configuration", label: "Configuration" },
]

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: 4, backgroundColor: Z.bgSubtle, borderRadius: 14, marginBottom: 32 }}>
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: FONT_HEADING,
              letterSpacing: "-0.01em",
              backgroundColor: isActive ? Z.bgCard : "transparent",
              color: isActive ? Z.text : Z.textMid,
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Architecture tab (original docs content) ────────────────────────── */

type DiagBox = {
  x: number; y: number; w: number; h: number
  title: string
  sub?: string
  bullets?: string[]
  accent?: "blue" | "amber" | "neutral"
  emphasis?: boolean
}

function ArchDiagram() {
  const W = 520
  const H = 940
  const COL = 150
  const CX = COL + 110

  const boxes: DiagBox[] = [
    { x: COL, y: 24,  w: 220, h: 36, title: "User search",       accent: "blue", emphasis: true },
    { x: COL, y: 88,  w: 220, h: 50, title: "POST /api/tasks",   sub: "natural-language query" },
    { x: COL, y: 166, w: 220, h: 60, title: "FindAll create",    sub: "generator: pro" },
    { x: COL, y: 254, w: 220, h: 70, title: "Match conditions",  sub: "is_rental_listing · fits_budget\n+ 18 enrichments" },
    { x: COL, y: 352, w: 220, h: 168, title: "_candidate_to_listing", bullets: [
      "block-domain guard",
      "junk-page filter",
      "plausibility floors",
      "address ≠ price guard",
      "bedroom min post-filter",
      "enrichments → details",
    ]},
    { x: COL, y: 548, w: 220, h: 60, title: "Task API (spam)",   sub: "processor: pro · 5 fact booleans" },
    { x: COL, y: 636, w: 220, h: 60, title: "Geocode + score",   sub: "Nominatim ~1/sec · in-session" },
    { x: COL, y: 724, w: 220, h: 50, title: "SSE stream",        sub: "GET /api/tasks/{id}/stream" },
    { x: COL, y: 802, w: 220, h: 36, title: "/demo UI (session)", accent: "blue", emphasis: true },
    { x: COL, y: 866, w: 220, h: 50, title: "Save to browser",   accent: "amber", emphasis: true, sub: "localStorage · client only" },
  ]

  type Arrow = { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
  const arrows: Arrow[] = [
    { x1: CX, y1: 60,  x2: CX, y2: 86 },
    { x1: CX, y1: 138, x2: CX, y2: 164 },
    { x1: CX, y1: 226, x2: CX, y2: 252 },
    { x1: CX, y1: 324, x2: CX, y2: 350 },
    { x1: CX, y1: 520, x2: CX, y2: 546 },
    { x1: CX, y1: 608, x2: CX, y2: 634 },
    { x1: CX, y1: 696, x2: CX, y2: 722 },
    { x1: CX, y1: 774, x2: CX, y2: 800 },
    { x1: CX, y1: 838, x2: CX, y2: 864, dashed: true },
  ]

  const fillFor = (b: DiagBox) => {
    if (b.emphasis) return Z.blueSoft
    if (b.accent === "amber") return "#FFF4E0"
    return Z.bgCard
  }
  const strokeFor = (b: DiagBox) => {
    if (b.accent === "amber") return "#F7D9A8"
    if (b.emphasis) return Z.blueBorder
    return Z.border
  }
  const titleColorFor = (b: DiagBox) => {
    if (b.emphasis) return Z.blueDarker
    if (b.accent === "amber") return "#5C4400"
    return Z.text
  }

  return (
    <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{
          display: "block",
          maxWidth: "100%",
          height: "auto",
          backgroundColor: Z.bgCard,
          border: `1px solid ${Z.border}`,
          borderRadius: 12,
          fontFamily: FONT_HEADING,
        }}
      >
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={Z.blueDark} />
          </marker>
          <filter id="boxShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#0E1117" floodOpacity="0.06" />
          </filter>
        </defs>
        <rect x={COL - 16} y={12} width={252} height={912} rx={16} fill={Z.bgPage} opacity={0.6} />
        {/* Baseline y must be >= ~8 so the 10px caps stay inside the viewBox. */}
        <text x={CX} y={10} textAnchor="middle" fontSize="10" fontWeight="700" fill={Z.textFaint} letterSpacing="0.14em">SEARCH → STREAM (STATELESS)</text>
        {arrows.map((a, i) => {
          const isHorizontal = Math.abs(a.y1 - a.y2) < 1
          const mark = isHorizontal ? undefined : "url(#arrowhead)"
          return (
            <line
              key={i}
              x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
              stroke={Z.blueDark}
              strokeWidth={1.5}
              strokeDasharray={a.dashed ? "4 3" : undefined}
              markerEnd={mark}
            />
          )
        })}
        {boxes.map((b, i) => {
          const titleY = b.bullets ? b.y + 22 : (b.sub ? b.y + 22 : b.y + b.h / 2 + 4)
          return (
            <g key={i} filter="url(#boxShadow)">
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={fillFor(b)} stroke={strokeFor(b)} strokeWidth={1} />
              <text x={b.x + b.w / 2} y={titleY} textAnchor="middle" fontSize={13} fontWeight={700} fill={titleColorFor(b)} letterSpacing="-0.01em">
                {b.title}
              </text>
              {b.sub && b.sub.split("\n").map((line, j) => (
                <text key={j} x={b.x + b.w / 2} y={titleY + 18 + j * 14} textAnchor="middle" fontSize="11" fill={Z.textMid} fontFamily={FONT_MONO}>
                  {line}
                </text>
              ))}
              {b.bullets && b.bullets.map((bullet, j) => (
                <text key={j} x={b.x + 14} y={b.y + 46 + j * 19} fontSize="11" fill={Z.textMid} fontFamily={FONT_MONO}>
                  · {bullet}
                </text>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const ARCH_NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "discovery", label: "Discovery" },
  { id: "enrichment", label: "Enrichment" },
  { id: "trust", label: "Trust scoring" },
  { id: "scoring", label: "Result scoring" },
  { id: "quality", label: "Quality controls" },
  { id: "config", label: "Configuration" },
  { id: "cookbook", label: "Cookbook fixes" },
]

function ArchTableOfContents({ activeId }: { activeId: string }) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 80,
        alignSelf: "flex-start",
        padding: "16px 18px",
        backgroundColor: Z.bgCard,
        border: `1px solid ${Z.border}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: Z.textFaint, textTransform: "uppercase", marginBottom: 10 }}>
        Contents
      </div>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {ARCH_NAV.map((n) => (
          <li key={n.id}>
            <a
              href={`#${n.id}`}
              style={{
                color: activeId === n.id ? Z.blueDark : Z.textSoft,
                fontWeight: activeId === n.id ? 700 : 500,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              {n.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function ArchitectureTab() {
  const [activeId, setActiveId] = useState<string>(ARCH_NAV[0].id)

  useEffect(() => {
    const sections = ARCH_NAV.map((n) => document.getElementById(n.id)).filter((x): x is HTMLElement => !!x)
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id)
        })
      },
      { rootMargin: "-30% 0% -60% 0%" },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 40 }}>
      <article>
        <H2 id="overview">Overview</H2>
        <P>One flow, and it runs entirely on demand. The user types natural language &#x2192; the backend builds a Parallel FindAll run with explicit match conditions and 18 enrichments &#x2192; matched candidates are parsed, spam-scored, geocoded, and scored, then streamed to the UI over SSE as they&apos;re verified.</P>
        <P>The backend is <strong style={{ color: Z.text }}>stateless</strong>: no database, no catalog, nothing persisted server-side. Each search is independent and its results live only in the browser session. The one piece of persistence is client-side &#x2014; the user can <strong style={{ color: Z.text }}>Save</strong> listings to a shortlist kept in their own browser via <Code>localStorage</Code> (key <Code>apartment-finder-saved-targets</Code>), never sent to any server.</P>

        <H2 id="pipeline">Pipeline</H2>
        <P>A single streaming pipeline. Each candidate passes through a guard chain, gets enriched and scored in-session, and is pushed to the client the moment it&apos;s verified &#x2014; results render progressively rather than after a batch write.</P>
        <ArchDiagram />

        <H2 id="discovery">Discovery</H2>
        <P>FindAll runs at the <Code>pro</Code> generator tier (env-overridable via <Code>FINDALL_GENERATOR</Code>). Match conditions are deliberately short and forgiving &#x2014; strict conditions cause zero-match runs because the API can&apos;t always verify them from page text.</P>
        <Card>
          <H3>Match conditions (only 2)</H3>
          <Block>{`is_rental_listing
  → "individual rental property listing in or near {CITY}.
     Reject any candidate whose URL is on these domains:
     zillow.com, apartments.com, yelp.com.
     Prefer the original landlord, broker, or property-management site."

fits_budget
  → "Asking monthly rent ≤ \${budget}.
     If rent isn't shown, treat as matched (don't reject for missing data)."`}</Block>
          <P>Bedroom count is <em>not</em> a match condition. We extract it via the <Code>bedrooms</Code> enrichment and post-filter against the user&apos;s requested minimum in <Code>_candidate_to_listing</Code>.</P>
        </Card>

        <H2 id="enrichment">Enrichment</H2>
        <P>The API extracts 18 structured fields per match. Each description follows the cookbook&apos;s <strong style={{ color: Z.text }}>Entity &#x2192; Action &#x2192; Specifics &#x2192; Error handling</strong> structure.</P>
        <Card>
          <H3>What we extract</H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 13, lineHeight: 1.7, color: Z.textMid }}>
            {["street_address","monthly_rent_usd","bedrooms","bathrooms","square_feet","available_date","lease_term","pet_policy","is_furnished","utilities_included","parking_type","laundry_type","building_amenities","neighborhood","contact_phone","contact_email","is_currently_active","days_on_market"].map(f => (
              <div key={f}>&#xB7; <Code>{f}</Code></div>
            ))}
          </div>
        </Card>

        <H2 id="trust">Trust scoring</H2>
        <P>For listings from untrusted sources, a Task-API call classifies them against five fact-based booleans. Score is computed in code from the true facts.</P>
        <Card>
          <H3>The five facts (weighted)</H3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.6 }}>
            {([["demands_off_platform_payment","60"],["owner_claims_to_be_abroad","30"],["withholds_address_until_contact","25"],["no_in_person_viewing_offered","20"],["unusual_incentives","15"]] as const).map(([k,w]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span><Code>{k}</Code></span>
                <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">{w} pts</Pill>
              </div>
            ))}
          </div>
        </Card>

        <H2 id="scoring">Result scoring</H2>
        <P>Every listing gets a 0&#x2013;100 score from three equally-weighted factors: recency, price fit, and proximity to the reference point. Because results are fetched fresh each search, recency is always at its maximum &#x2014; ranking is driven by price fit and proximity.</P>
        <Card>
          <H3>Bands</H3>
          <Block>{`Recency (max 33)        Price fit (max 33)         Proximity (max 33)
  < 24h:  +33             ≤ 0.7 ratio: +33          < 1 km:   +33
  < 72h:  +24             0.7–0.8:     +28          < 2.5 km: +24
  < 168h: +14             0.8–0.9:     +22          < 5 km:   +16
  else:   +5              0.9–1.0:     +14          else:     +9`}</Block>
        </Card>

        <H2 id="quality">Quality controls</H2>
        <Card accent={Z.red}>
          <H3>Blocked domains</H3>
          <P>Refused at two layers: the FindAll match condition, and a URL guard during candidate parsing.</P>
          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
            <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>zillow.com</Pill>
            <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>apartments.com</Pill>
            <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>yelp.com</Pill>
          </div>
        </Card>

        <Card accent={Z.amber}>
          <H3>Plausibility floors</H3>
          <P>A per-bedroom rent floor catches listings where the model picked up the street number, zip code, or a deposit as the rent.</P>
        </Card>

        <Card accent={Z.amber}>
          <H3>Stale-results filter</H3>
          <P>A frontend guard: even though results are fetched fresh each search, a listing the API reports as inactive (<Code>is_currently_active = false</Code>) or past its freshness window &#x2014; aggregator sites &gt;14 days, direct sources &gt;45 days &#x2014; is flagged as likely-stale and hidden by default.</P>
        </Card>

        <H2 id="config">Configuration</H2>
        <P>All knobs are environment variables in <Code>.env</Code>. See the Configuration tab for live values.</P>

        <H2 id="cookbook">Cookbook fixes</H2>
        <P>Five anti-patterns from the Parallel cookbook were fixed during development:</P>
        {[
          ["1. Subjective output decomposition", "Replaced is_likely_spam with five fact-based booleans weighted in code."],
          ["2. No rationale / confidence fields", "Removed duplicate reasoning — the Task API returns basis arrays natively."],
          ["3. Required arrays include all properties", "All schemas use required + additionalProperties: false."],
          ["4. Standardized error sentinel", 'Every enrichment returns empty string when data is missing.'],
          ["5. Entity → Action → Specifics → Error", "All 18 enrichment descriptions follow this four-part structure."],
        ].map(([title, desc]) => (
          <Card key={title}>
            <H3>{title}</H3>
            <P>{desc}</P>
          </Card>
        ))}
      </article>

      <ArchTableOfContents activeId={activeId} />
    </div>
  )
}

/* ── Live API Calls tab ──────────────────────────────────────────────── */

type ApiCall = {
  timestamp: string
  api: string
  method: string
  path: string
  status_code: number | null
  duration_ms: number | null
  request_summary: string
  response_summary: string
  error: string | null
}

type ApiCallsResponse = {
  calls: ApiCall[]
  stats: { total: number; errors: number; buffer_size: number }
}

const API_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  FindAll:  { bg: Z.blueSoft,  fg: Z.blueDark,  border: Z.blueBorder },
  Monitor:  { bg: "#FFF4E0",   fg: "#A66300",   border: "#F7D9A8" },
  Task:     { bg: Z.greenSoft, fg: Z.green,     border: "#BAE0C2" },
  Geocode:  { bg: Z.bgSubtle,  fg: Z.textMid,   border: Z.border },
}

function ApiCallRow({ call }: { call: ApiCall }) {
  const [expanded, setExpanded] = useState(false)
  const colors = API_COLORS[call.api] ?? API_COLORS.Geocode
  const isError = call.error || (call.status_code && call.status_code >= 400)
  const ts = new Date(call.timestamp)
  const timeStr = ts.toLocaleTimeString()

  return (
    <div
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${isError ? "#F4B5B5" : Z.border}`,
        borderRadius: 10,
        marginBottom: 6,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONT_BODY,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 6,
            backgroundColor: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.border}`,
            fontFamily: FONT_HEADING,
            letterSpacing: "0.02em",
            flexShrink: 0,
            minWidth: 58,
            textAlign: "center",
          }}
        >
          {call.api}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: call.method === "POST" ? Z.blueDark : Z.textMid,
            fontFamily: FONT_MONO,
            flexShrink: 0,
            width: 36,
          }}
        >
          {call.method}
        </span>
        <span
          style={{
            fontSize: 12,
            color: Z.textSoft,
            fontFamily: FONT_MONO,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {call.path}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isError ? Z.red : call.status_code && call.status_code < 300 ? Z.green : Z.textMid,
            fontFamily: FONT_MONO,
            flexShrink: 0,
          }}
        >
          {call.status_code ?? "ERR"}
        </span>
        {call.duration_ms != null && (
          <span style={{ fontSize: 11, color: Z.textFaint, fontFamily: FONT_MONO, flexShrink: 0, minWidth: 52, textAlign: "right" }}>
            {call.duration_ms < 1000 ? `${Math.round(call.duration_ms)}ms` : `${(call.duration_ms / 1000).toFixed(1)}s`}
          </span>
        )}
        <span style={{ fontSize: 11, color: Z.textFaint, flexShrink: 0 }}>{timeStr}</span>
        <span style={{ fontSize: 10, color: Z.textFaint, flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>&#x25B6;</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${Z.borderSoft}` }}>
          {call.error && (
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, backgroundColor: Z.redSoft, color: Z.red, fontSize: 12, fontFamily: FONT_MONO }}>
              {call.error}
            </div>
          )}
          {call.request_summary && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Request</div>
              <pre style={{ fontSize: 11, color: Z.textSoft, fontFamily: FONT_MONO, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, padding: "8px 10px", backgroundColor: Z.bgSubtle, borderRadius: 8 }}>
                {call.request_summary}
              </pre>
            </div>
          )}
          {call.response_summary && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Response</div>
              <pre style={{ fontSize: 11, color: Z.textSoft, fontFamily: FONT_MONO, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, padding: "8px 10px", backgroundColor: Z.bgSubtle, borderRadius: 8 }}>
                {call.response_summary}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LiveApiCallsTab() {
  const [data, setData] = useState<ApiCallsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<string>("all")

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch(api("/api/debug/api-calls?limit=100"))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch")
    }
  }, [])

  useEffect(() => {
    // fetchCalls only setState()s after an await, so this is not a synchronous
    // effect-body setState despite what the lint rule infers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalls()
    if (paused) return
    const t = setInterval(fetchCalls, 5000)
    return () => clearInterval(t)
  }, [fetchCalls, paused])

  const calls = data?.calls ?? []
  const filtered = filter === "all" ? calls : calls.filter(c => c.api === filter)
  const apis = [...new Set(calls.map(c => c.api))]

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: Z.textFaint, textTransform: "uppercase", letterSpacing: "0.1em" }}>Filter:</span>
          {["all", ...apis].map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setFilter(a)}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: `1px solid ${filter === a ? Z.blueBorder : Z.border}`,
                backgroundColor: filter === a ? Z.blueSoft : Z.bgCard,
                color: filter === a ? Z.blueDark : Z.textMid,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FONT_HEADING,
              }}
            >
              {a === "all" ? "All" : a}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {data?.stats && (
            <span style={{ fontSize: 12, color: Z.textMid }}>
              {data.stats.total} total calls &middot; {data.stats.errors} errors
            </span>
          )}
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              border: `1px solid ${Z.border}`,
              backgroundColor: paused ? Z.blueSoft : Z.bgCard,
              color: paused ? Z.blueDark : Z.textMid,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT_HEADING,
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      {error && (
        <Card accent={Z.red}>
          <P>Could not load API calls: {error}. Make sure the backend is running.</P>
        </Card>
      )}

      {filtered.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: "60px 0", color: Z.textFaint }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>No API calls recorded yet</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Run a search from the main page to see calls appear here in real time.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column-reverse" }}>
        {filtered.map((call, i) => (
          <ApiCallRow key={`${call.timestamp}-${i}`} call={call} />
        ))}
      </div>
    </div>
  )
}

/* ── Configuration tab ───────────────────────────────────────────────── */

function ConfigurationTab() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(api("/api/config")).then(r => r.ok ? r.json() : null),
      fetch(api("/api/health")).then(r => r.ok ? r.json() : null),
    ]).then(([c, h]) => {
      setConfig(c)
      setHealth(h)
    }).catch(e => setError(e instanceof Error ? e.message : "Failed"))
  }, [])

  if (error) return <Card accent={Z.red}><P>Could not load config: {error}</P></Card>
  if (!config) return <P>Loading configuration...</P>

  type ConfigRow = { label: string; value: string; env?: string }
  const rows: ConfigRow[] = [
    { label: "City", value: config.city, env: "CITY" },
    { label: "City (short)", value: config.cityShort, env: "CITY_SHORT" },
    { label: "Default budget", value: `$${config.defaultBudget.toLocaleString()}`, env: "SEARCH_BUDGET" },
    { label: "Reference point", value: `${config.referencePoint.name} (${config.referencePoint.lat}, ${config.referencePoint.lng})`, env: "REFERENCE_POINT_*" },
    { label: "Map center", value: `${config.mapCenter.lat}, ${config.mapCenter.lng}`, env: "MAP_CENTER_*" },
    { label: "Map zoom", value: String(config.mapZoom), env: "MAP_ZOOM" },
    { label: "Aggregator stale days", value: `${config.staleness.aggregatorDays}d`, env: "STALE_AGGREGATOR_DAYS" },
    { label: "Direct stale days", value: `${config.staleness.directDays}d`, env: "STALE_DIRECT_DAYS" },
    { label: "Brand", value: config.brand.name, env: "BRAND_NAME" },
    { label: "Tagline", value: config.brand.tagline, env: "BRAND_TAGLINE" },
  ]

  const rentFloorEntries = Object.entries(config.rentFloors).sort(([a], [b]) => Number(a) - Number(b))

  return (
    <div>
      <H2>Runtime Configuration</H2>
      <P>These values are loaded from the backend&apos;s environment variables on startup. They drive search behavior, scoring, and the UI.</P>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 140px", gap: "1px", fontSize: 13 }}>
          <div style={{ padding: "8px 0", fontWeight: 700, color: Z.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Setting</div>
          <div style={{ padding: "8px 0", fontWeight: 700, color: Z.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Value</div>
          <div style={{ padding: "8px 0", fontWeight: 700, color: Z.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>Env var</div>
          {rows.map(r => (
            <div key={r.label} style={{ display: "contents" }}>
              <div style={{ padding: "6px 0", color: Z.text, fontWeight: 600 }}>{r.label}</div>
              <div style={{ padding: "6px 0", color: Z.textSoft, fontFamily: FONT_MONO, fontSize: 12 }}>{r.value}</div>
              <div style={{ padding: "6px 0" }}>{r.env && <Code>{r.env}</Code>}</div>
            </div>
          ))}
        </div>
      </Card>

      <H2>Rent Floors</H2>
      <P>Per-bedroom minimum rent for plausibility filtering. Listings below ~55% of these values are rejected.</P>
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {rentFloorEntries.map(([beds, floor]) => (
            <div key={beds} style={{ padding: "8px 14px", borderRadius: 10, backgroundColor: Z.bgSubtle, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: Z.textFaint, fontWeight: 700 }}>{beds === "0" ? "Studio" : `${beds}BR`}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: Z.text, fontFamily: FONT_HEADING }}>${Number(floor).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>

      <H2>Search Suggestions</H2>
      <P>Pre-configured queries shown as chips on the search bar.</P>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {config.suggestions.map((s, i) => (
          <Pill key={i}>{s}</Pill>
        ))}
      </div>

      {health && (
        <>
          <H2>System Health</H2>
          <Card>
            <Block>{JSON.stringify(health, null, 2)}</Block>
          </Card>
        </>
      )}
    </div>
  )
}

/* ── Page shell ──────────────────────────────────────────────────────── */

export default function DocsPage() {
  const [tab, setTab] = useState<TabId>("architecture")

  return (
    <div style={{ minHeight: "100vh", backgroundColor: Z.bgPage, color: Z.text, fontFamily: FONT_BODY }}>
      <header
        style={{
          position: "sticky", top: 0, zIndex: 20,
          backgroundColor: "rgba(255,255,255,0.92)",
          borderBottom: `1px solid ${Z.border}`,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src="/parallel-logo.svg" alt="Parallel" style={{ height: 28, width: "auto" }} />
            <span
              style={{
                paddingLeft: 16, borderLeft: `1px solid ${Z.border}`,
                fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                color: Z.textMid, textTransform: "uppercase",
              }}
            >
              How this was built
            </span>
          </div>
          <a href="/" style={{ fontSize: 12, fontWeight: 700, color: Z.blueDark, textDecoration: "none" }}>
            &#x2190; back to search
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        <section style={{ marginBottom: 24 }}>
          <Pill>Reference</Pill>
          <div style={{ height: 16 }} />
          <H1>How this was built</H1>
          <p style={{ fontSize: "1.15rem", color: Z.textMid, lineHeight: 1.55, marginTop: 12, maxWidth: 720 }}>
            A technical reference for the pipeline, live visibility into every external API call,
            and the runtime configuration driving this instance.
          </p>
        </section>

        <TabBar active={tab} onChange={setTab} />

        {tab === "architecture" && <ArchitectureTab />}
        {tab === "api-calls" && <LiveApiCallsTab />}
        {tab === "configuration" && <ConfigurationTab />}

        <footer style={{ marginTop: 80, paddingTop: 24, borderTop: `1px solid ${Z.border}`, fontSize: 12, color: Z.textFaint }}>
          Demo &middot; Search powered by{" "}
          <a
            href="https://parallel.ai" target="_blank" rel="noopener noreferrer"
            style={{ color: Z.blueDark, fontWeight: 600 }}
          >
            Parallel
          </a>
        </footer>
      </main>
    </div>
  )
}
