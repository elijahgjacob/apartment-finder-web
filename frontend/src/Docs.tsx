import { useEffect, useState } from "react"

// Parallel Web Systems palette — see Demo.tsx for source of values.
const Z = {
  blue: "#fb631b",
  blueDark: "#cb4f12",
  blueDarker: "#8a3608",
  blueSoft: "#fff0e8",
  blueSofter: "#fffaf6",
  blueBorder: "#fcc7a8",
  text: "#1d1b16",
  textSoft: "#3a352a",
  textMid: "#5e574a",
  textFaint: "#8a8273",
  bgPage: "#fcfcfa",
  bgCard: "#ffffff",
  bgSubtle: "#f4f0e6",
  border: "#d8d0bf",
  borderSoft: "#e8e1cf",
  green: "#137333",
  greenSoft: "#E6F4EA",
  amber: "#C77700",
  amberSoft: "#FFF4E0",
  red: "#C62828",
}

const FONT_HEADING = "'Geist Variable', 'Geist', system-ui, sans-serif"
const FONT_BODY = "'Geist Variable', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

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

// ── Architecture diagram ────────────────────────────────────────────────

type DiagBox = {
  x: number; y: number; w: number; h: number
  title: string
  sub?: string
  bullets?: string[]
  accent?: "blue" | "amber" | "neutral"
  emphasis?: boolean
}

function ArchDiagram() {
  // Layout constants
  const W = 880
  const H = 940
  const COL_L = 80
  const COL_R = 540
  const COL_C_LEFT = COL_L + 110          // center of left col box (220 wide)
  const COL_C_RIGHT = COL_R + 110
  const COL_C = W / 2

  const boxes: DiagBox[] = [
    // Header strip
    { x: COL_L,  y: 24,  w: 220, h: 36, title: "User search",       accent: "blue", emphasis: true },
    { x: COL_R,  y: 24,  w: 220, h: 36, title: "Background watch",  accent: "blue", emphasis: true },

    // User search column
    { x: COL_L,  y: 90,  w: 220, h: 50, title: "POST /api/tasks",   sub: "natural-language query" },
    { x: COL_L,  y: 170, w: 220, h: 60, title: "FindAll create",     sub: "generator: pro" },
    { x: COL_L,  y: 260, w: 220, h: 70, title: "Match conditions",   sub: "is_rental_listing · fits_budget\n+ 18 enrichments" },
    { x: COL_L,  y: 360, w: 220, h: 168, title: "_candidate_to_listing", bullets: [
      "block-domain guard",
      "junk-page filter",
      "plausibility floors",
      "address ≠ price guard",
      "bedroom min post-filter",
      "enrichments → details",
    ]},
    { x: COL_L,  y: 558, w: 220, h: 60, title: "Task API (spam)",    sub: "processor: pro · 5 fact booleans" },

    // Background watch column
    { x: COL_R,  y: 90,  w: 220, h: 50, title: "Parallel Monitor",  sub: "1h tick · processor: base" },
    { x: COL_R,  y: 170, w: 220, h: 60, title: "GET /events",        sub: "every 60s, local poll loop" },
    { x: COL_R,  y: 260, w: 220, h: 70, title: "_event_to_listing",  sub: "block-domain · junk-page\nbounds checks" },

    // Convergence
    { x: 330,    y: 678, w: 220, h: 60, title: "SQLite catalog",     accent: "amber", emphasis: true },
    { x: 330,    y: 768, w: 220, h: 50, title: "GET /api/listings",  sub: "client poll every 30s" },
    { x: 330,    y: 848, w: 220, h: 50, title: "/demo UI",           accent: "blue", emphasis: true },
  ]

  type Arrow = { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
  const arrows: Arrow[] = [
    // Left column down-chain
    { x1: COL_C_LEFT, y1: 60,  x2: COL_C_LEFT, y2: 88 },
    { x1: COL_C_LEFT, y1: 140, x2: COL_C_LEFT, y2: 168 },
    { x1: COL_C_LEFT, y1: 230, x2: COL_C_LEFT, y2: 258 },
    { x1: COL_C_LEFT, y1: 330, x2: COL_C_LEFT, y2: 358 },
    { x1: COL_C_LEFT, y1: 528, x2: COL_C_LEFT, y2: 556 },

    // Right column down-chain
    { x1: COL_C_RIGHT, y1: 60,  x2: COL_C_RIGHT, y2: 88 },
    { x1: COL_C_RIGHT, y1: 140, x2: COL_C_RIGHT, y2: 168 },
    { x1: COL_C_RIGHT, y1: 230, x2: COL_C_RIGHT, y2: 258 },

    // Convergence into SQLite (curved with mid-bend shown as polyline-style L)
    { x1: COL_C_LEFT,  y1: 618, x2: COL_C_LEFT,  y2: 660 },
    { x1: COL_C_RIGHT, y1: 330, x2: COL_C_RIGHT, y2: 660 },
    { x1: COL_C_LEFT,  y1: 660, x2: COL_C,        y2: 660 },
    { x1: COL_C_RIGHT, y1: 660, x2: COL_C,        y2: 660 },
    { x1: COL_C,       y1: 660, x2: COL_C,        y2: 676 },

    // Catalog → API → UI
    { x1: COL_C, y1: 738, x2: COL_C, y2: 766 },
    { x1: COL_C, y1: 818, x2: COL_C, y2: 846 },
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

        {/* Column lane backgrounds (subtle) */}
        <rect x={COL_L - 16}   y={12}  width={252}  height={620} rx={16} fill={Z.bgPage} opacity={0.6} />
        <rect x={COL_R - 16}   y={12}  width={252}  height={325} rx={16} fill={Z.bgPage} opacity={0.6} />

        {/* Lane labels */}
        <text x={COL_C_LEFT}  y={6}  textAnchor="middle" fontSize="10" fontWeight="700" fill={Z.textFaint} letterSpacing="0.14em">
          USER-DRIVEN
        </text>
        <text x={COL_C_RIGHT} y={6}  textAnchor="middle" fontSize="10" fontWeight="700" fill={Z.textFaint} letterSpacing="0.14em">
          ALWAYS-ON
        </text>

        {/* Arrows */}
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

        {/* Boxes */}
        {boxes.map((b, i) => {
          const titleY = b.bullets ? b.y + 22 : (b.sub ? b.y + 22 : b.y + b.h / 2 + 4)
          return (
            <g key={i} filter="url(#boxShadow)">
              <rect
                x={b.x} y={b.y}
                width={b.w} height={b.h}
                rx={10}
                fill={fillFor(b)}
                stroke={strokeFor(b)}
                strokeWidth={1}
              />
              <text
                x={b.x + b.w / 2}
                y={titleY}
                textAnchor="middle"
                fontSize={b.emphasis ? 13 : 13}
                fontWeight={700}
                fill={titleColorFor(b)}
                letterSpacing="-0.01em"
              >
                {b.title}
              </text>
              {b.sub && b.sub.split("\n").map((line, j) => (
                <text
                  key={j}
                  x={b.x + b.w / 2}
                  y={titleY + 18 + j * 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill={Z.textMid}
                  fontFamily={FONT_MONO}
                >
                  {line}
                </text>
              ))}
              {b.bullets && b.bullets.map((bullet, j) => (
                <text
                  key={j}
                  x={b.x + 14}
                  y={b.y + 46 + j * 19}
                  fontSize="11"
                  fill={Z.textMid}
                  fontFamily={FONT_MONO}
                >
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

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        backgroundColor: Z.bgCard,
        border: `1px solid ${Z.border}`,
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

const NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "discovery", label: "Discovery" },
  { id: "enrichment", label: "Enrichment" },
  { id: "trust", label: "Trust scoring" },
  { id: "monitor", label: "Always-on watch" },
  { id: "scoring", label: "Result scoring" },
  { id: "quality", label: "Quality controls" },
  { id: "config", label: "Configuration" },
  { id: "cookbook", label: "Cookbook fixes" },
]

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 24,
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
        {NAV.map((n) => (
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

export default function Docs() {
  const [activeId, setActiveId] = useState<string>(NAV[0].id)

  // Track which section is active in the viewport for the TOC.
  useEffect(() => {
    const sections = NAV.map((n) => document.getElementById(n.id)).filter((x): x is HTMLElement => !!x)
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
            <img src="/zillow-logo.png" alt="Zillow" style={{ height: 28, width: "auto" }} />
            <span
              style={{
                paddingLeft: 16, borderLeft: `1px solid ${Z.border}`,
                fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                color: Z.textMid, textTransform: "uppercase",
              }}
            >
              AI Search · Docs
            </span>
          </div>
          <a href="/" style={{ fontSize: 12, fontWeight: 700, color: Z.blueDark, textDecoration: "none" }}>
            ← back to demo
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 80px" }}>
        <section style={{ marginBottom: 40 }}>
          <Pill>Reference</Pill>
          <div style={{ height: 16 }} />
          <H1>How AI Search works</H1>
          <p style={{ fontSize: "1.15rem", color: Z.textMid, lineHeight: 1.55, marginTop: 12, maxWidth: 720 }}>
            A technical reference for the pipeline behind <Code>/demo</Code>. Every design choice
            below was driven by a real failure mode we hit while building this. The
            anti-patterns surfaced from auditing against{" "}
            <a
              href="https://github.com/parallel-web/parallel-cookbook/blob/main/task-best-practices.md"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: Z.blueDark, fontWeight: 600, textDecoration: "underline" }}
            >
              the Parallel cookbook
            </a>
            .
          </p>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 40 }}>
          <article>

            <H2 id="overview">Overview</H2>
            <P>
              Two flows feed listings into the catalog:
            </P>
            <ul style={{ color: Z.textSoft, lineHeight: 1.8, fontSize: "0.95rem", paddingLeft: 24 }}>
              <li>
                <strong style={{ color: Z.text }}>User-driven discovery.</strong>{" "}
                User types natural language → backend translates into a Parallel
                FindAll run with explicit match conditions and 18 enrichments → matched
                candidates stream to the UI as they're verified.
              </li>
              <li>
                <strong style={{ color: Z.text }}>Always-on watch.</strong>{" "}
                A Parallel Monitor runs hourly with a saved query → events POSTed to
                the local poll loop → new findings persisted with{" "}
                <Code>details.via_monitor = true</Code>.
              </li>
            </ul>
            <P>
              Both flows write to the same SQLite catalog. The frontend hydrates from{" "}
              <Code>/api/listings</Code> on mount and polls every 30s, so Monitor-discovered
              listings show up without a page reload.
            </P>

            <H2 id="pipeline">Pipeline</H2>
            <P>
              Two flows feed the SQLite catalog. Both pass through their own
              guard chain before insert; the UI hydrates from the merged set.
            </P>
            <ArchDiagram />

            <H2 id="discovery">Discovery</H2>
            <P>
              FindAll runs at the <Code>pro</Code> generator tier (env-overridable via{" "}
              <Code>FINDALL_GENERATOR</Code>). Match conditions are deliberately short and
              forgiving — strict conditions cause zero-match runs because the API can't
              always verify them from page text.
            </P>
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
              <P>
                Bedroom count is <em>not</em> a match condition. We extract it via the{" "}
                <Code>bedrooms</Code> enrichment and post-filter against the user's
                requested minimum in <Code>_candidate_to_listing</Code>. This stops the
                "I see '3+ beds available'" miscue from sinking the whole match.
              </P>
            </Card>

            <H2 id="enrichment">Enrichment</H2>
            <P>
              The API extracts 18 structured fields per match. Each description follows
              the cookbook's{" "}
              <strong style={{ color: Z.text }}>Entity → Action → Specifics → Error handling</strong>{" "}
              structure, and standardizes on an empty string as the universal "page
              didn't say" sentinel.
            </P>
            <Card>
              <H3>What we extract</H3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 13, lineHeight: 1.7, color: Z.textMid }}>
                <div>· <Code>street_address</Code></div>
                <div>· <Code>monthly_rent_usd</Code></div>
                <div>· <Code>bedrooms</Code></div>
                <div>· <Code>bathrooms</Code></div>
                <div>· <Code>square_feet</Code></div>
                <div>· <Code>available_date</Code></div>
                <div>· <Code>lease_term</Code></div>
                <div>· <Code>pet_policy</Code></div>
                <div>· <Code>is_furnished</Code></div>
                <div>· <Code>utilities_included</Code></div>
                <div>· <Code>parking_type</Code></div>
                <div>· <Code>laundry_type</Code></div>
                <div>· <Code>building_amenities</Code></div>
                <div>· <Code>neighborhood</Code></div>
                <div>· <Code>contact_phone</Code></div>
                <div>· <Code>contact_email</Code></div>
                <div>· <Code>is_currently_active</Code></div>
                <div>· <Code>days_on_market</Code></div>
              </div>
              <P>
                The <Code>monthly_rent_usd</Code> description includes a defensive line:
                <em>"do not confuse the rent with the street number, the zip code, the
                year built, or square footage."</em> This was added after we found
                listings like <Code>789 Page St</Code> getting saved with <Code>$789</Code> rent.
              </P>
            </Card>

            <H2 id="trust">Trust scoring</H2>
            <P>
              For listings from untrusted sources, a Task-API call classifies them
              against five fact-based booleans. Score is computed in code from the
              true facts; the model never returns "is this spam" directly because
              that's exactly the kind of subjective output the cookbook calls out.
            </P>
            <Card>
              <H3>The five facts (weighted)</H3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Code>demands_off_platform_payment</Code></span>
                  <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">60 pts</Pill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Code>owner_claims_to_be_abroad</Code></span>
                  <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">30 pts</Pill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Code>withholds_address_until_contact</Code></span>
                  <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">25 pts</Pill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Code>no_in_person_viewing_offered</Code></span>
                  <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">20 pts</Pill>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span><Code>unusual_incentives</Code></span>
                  <Pill bg={Z.greenSoft} color={Z.green} border="#BAE0C2">15 pts</Pill>
                </div>
              </div>
              <P>
                Any single canonical scam signal alone (off-platform payment) clears
                the 50-point hide threshold. Soft signals accumulate before tripping
                it. Listings from trusted sources (apartments, zillow, redfin, realtor,
                trulia, rent, hotpads) skip this call entirely.
              </P>
            </Card>

            <H2 id="monitor">Always-on watch</H2>
            <P>
              A single Parallel Monitor runs at <Code>1h</Code> frequency with the{" "}
              <Code>base</Code> processor (Monitor accepts only <Code>lite</Code>/
              <Code>base</Code>). The query string explicitly excludes blocked domains.
              The local poll loop hits <Code>GET /v1/monitors/{"{id}"}/events</Code> every
              60s for new events.
            </P>
            <P>
              On the UI, click <strong>Watch this query</strong> in the monitor strip to
              cancel the existing Monitor and create a fresh one tracking your typed
              query. <Code>POST /api/monitor</Code> handles the swap; <Code>DELETE /api/monitor</Code>{" "}
              stops watching entirely.
            </P>
            <Card accent={Z.blue}>
              <H3>Each event includes</H3>
              <Block>{`{
  listing_url, title, address, neighborhood,
  price, bedrooms, bathrooms, summary
}`}</Block>
              <P>
                Plus <Code>basis</Code> with citations per field — these power the
                "Sources" row on the listing card.
              </P>
            </Card>

            <H2 id="scoring">Result scoring</H2>
            <P>
              Every listing gets a 0–100 score from three equally-weighted factors:
              recency, price fit, and proximity to the reference point. Each factor
              contributes at most 33 points. No single signal dominates ranking.
            </P>
            <Card>
              <H3>Bands</H3>
              <Block>{`Recency (max 33)
  < 24h:  +33
  < 72h:  +24
  < 168h: +14
  else:   +5

Price fit (max 33, U-curve)
  ratio > 1.0:                                    +0   (over budget)
  price < 60% of typical for this bedroom count:  +6   (suspect — likely parse error)
  ratio ≤ 0.7:                                    +33  (good deal, realistic)
  ratio 0.7-0.8:                                  +28
  ratio 0.8-0.9:                                  +22
  ratio 0.9-1.0:                                  +14  (top of budget)

Proximity to reference point (max 33)
  < 1 km:    +33
  < 2.5 km:  +24
  < 5 km:    +16
  else:      +9`}</Block>
            </Card>
            <P>
              Strong-fit threshold is <Code>70/100</Code>. The UI hides everything below
              that bar by default; a toggle reveals the rest.
            </P>

            <H2 id="quality">Quality controls</H2>

            <Card accent={Z.red}>
              <H3>Blocked domains</H3>
              <P>
                Refused at three layers: FindAll match condition, Monitor query string,
                and an insert-time URL guard. Default blocklist:
              </P>
              <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
                <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>zillow.com</Pill>
                <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>apartments.com</Pill>
                <Pill bg={Z.bgSubtle} color={Z.text} border={Z.border}>yelp.com</Pill>
              </div>
              <P>
                Override with the <Code>BLOCKED_DOMAINS</Code> env var.
              </P>
            </Card>

            <Card accent={Z.amber}>
              <H3>Plausibility floors</H3>
              <P>
                A per-bedroom rent floor catches listings where the model picked up
                the street number, zip code, or a deposit as the rent. Anything below
                ~55% of typical SF rent for the bed count is rejected at insert time.
              </P>
              <Block>{`Studio: $1,045    1BR: $1,485    2BR: $1,980
3BR:    $2,860    4BR: $3,575    5+BR: $4,400
unknown beds: $1,500 absolute floor

Plus: if parsed price exactly matches any number in the
street address, reject. (Catches "789 Page St → $789" and
"Unit S30414, 1475 Fillmore St → $1,475" alike.)`}</Block>
            </Card>

            <Card accent={Z.amber}>
              <H3>Stale-results filter</H3>
              <P>
                Aggregator sites keep listings live in their index after the unit is
                rented. Tiered freshness windows by source:
              </P>
              <Block>{`Aggregators (apartments, trulia, hotpads, padmapper,
              rentcafe, rent, showcase): > 14 days = stale
Direct/curated (craigslist, redfin, compass,
              realtor, web): > 45 days = stale
API-derived signal wins when present:
  details.is_currently_active === false → stale
  details.days_on_market past tier window → stale`}</Block>
              <P>
                Stale results are hidden by default; a toggle below the list reveals
                them. Each card in the visible-stale view gets a <Pill bg={Z.amberSoft} color={Z.amber} border="#F7D9A8">stale?</Pill> chip.
              </P>
            </Card>

            <H2 id="config">Configuration</H2>
            <P>All knobs are environment variables in <Code>.env</Code>:</P>
            <Block>{`# Search defaults
SEARCH_QUERY=apartments for rent in San Francisco
SEARCH_BUDGET=7500
SEARCH_BEDROOMS=3

# Reference point (proximity scoring)
REFERENCE_POINT_NAME=Caltrain · 4th & King
REFERENCE_POINT_LAT=37.7764
REFERENCE_POINT_LNG=-122.3973

# Always-on watch
MONITOR_FREQUENCY=1h               # 1h / 6h / 1d / 1w / 30d
MONITOR_PROCESSOR=base             # only 'lite' or 'base' supported by Parallel
MONITOR_POLL_SECONDS=60
MONITOR_INCLUDE_BACKFILL=true

# Processor tiers (user has unlimited spend)
TASK_SPAM_PROCESSOR=pro            # spam classification
FINDALL_GENERATOR=pro              # discovery search

# Domains we don't want results from
BLOCKED_DOMAINS=zillow.com,apartments.com,yelp.com

# Auth
INTERNAL_API_KEY=                  # blank = local dev (auth bypassed)`}</Block>

            <H2 id="cookbook">Cookbook fixes</H2>
            <P>
              Five anti-patterns from <em>parallel-cookbook/task-best-practices.md</em>{" "}
              were live in this codebase at one point. All applied:
            </P>

            <Card>
              <H3>1. Subjective output → fact-based decomposition</H3>
              <P>
                The original spam schema asked for <Code>is_likely_spam: bool</Code> +{" "}
                <Code>spam_confidence: float</Code> — a textbook subjective field. Replaced
                with five fact-based booleans the API can verify with citations, then
                weighted in code.
              </P>
            </Card>

            <Card>
              <H3>2. Don't ask for <Code>rationale</Code> / <Code>confidence</Code></H3>
              <P>
                The cookbook is explicit: reasoning and confidence are returned in the
                Task API's per-field <Code>basis</Code> array — no need to re-emit them
                in the schema. Both fields removed; they cost tokens for duplicates.
              </P>
            </Card>

            <Card>
              <H3>3. <Code>required</Code> arrays must include all properties</H3>
              <P>
                Schemas now mark every property as required and set{" "}
                <Code>additionalProperties: false</Code>.
              </P>
            </Card>

            <Card>
              <H3>4. Standardized error-handling sentinel</H3>
              <P>
                Every enrichment description ends with <em>"return an empty string"</em>{" "}
                when the page lacks the data. Killed the inconsistent fallbacks (<Code>N/A</Code>,{" "}
                <Code>null</Code>, <Code>"Not specified"</Code>, <Code>"Unknown"</Code>) we
                were defending against in <Code>_NA_VALUES</Code>.
              </P>
            </Card>

            <Card>
              <H3>5. Cookbook-canonical Entity → Action → Specifics → Error</H3>
              <P>
                Every one of the 18 enrichment descriptions follows that four-part
                structure. The <Code>monthly_rent_usd</Code> description is the most
                load-bearing — its "do not confuse with the street number" line directly
                fixed the parse-miscue class of bugs.
              </P>
            </Card>

          </article>

          <TableOfContents activeId={activeId} />
        </div>

        <footer style={{ marginTop: 80, paddingTop: 24, borderTop: `1px solid ${Z.border}`, fontSize: 12, color: Z.textFaint }}>
          Demo · Not affiliated with Zillow Group, Inc. · Search powered by{" "}
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
