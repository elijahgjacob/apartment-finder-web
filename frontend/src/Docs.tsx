import { useEffect, useState } from "react"

// Reusing the Zillow palette + Geist heading font from Demo.tsx
const Z = {
  blue: "#1F45FC",
  blueDark: "#1736C7",
  blueDarker: "#0D1F8A",
  blueSoft: "#EEF1FF",
  blueSofter: "#F7F9FF",
  blueBorder: "#C7D2FF",
  text: "#0E1117",
  textSoft: "#3D434D",
  textMid: "#5C6370",
  textFaint: "#8B919E",
  bgPage: "#F7F8FA",
  bgCard: "#FFFFFF",
  bgSubtle: "#F2F4F7",
  border: "#E4E7EC",
  borderSoft: "#EFF1F5",
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
            <Block>{`User search                              Background watch
─────────────────────────                ─────────────────────────
POST /api/tasks                          Parallel Monitor (1h tick)
   │                                        │
   │  Build objective + match_conditions    │  Hosted query
   │  + 18 enrichments + min_beds gate      │  (excludes blocked domains)
   ▼                                        ▼
FindAll create (generator: pro)          GET /v1/monitors/{id}/events
   │  poll until "completed"                │  every 60s from local loop
   ▼                                        ▼
Matched candidates                       Event payload (with output schema)
   │                                        │
   │  _candidate_to_listing()               │  _event_to_listing()
   │   ├─ block-domain guard                │   ├─ block-domain guard
   │   ├─ junk-page URL filter              │   ├─ junk-page URL filter
   │   ├─ plausibility floors               │   ├─ price > 500 / < 50k
   │   ├─ address ≠ price guard             │
   │   └─ enrichment fields → details       │
   ▼                                        ▼
Spam-score (Task API, processor: pro)    (skip — Monitor adds fewer)
   │                                        │
   ▼                                        ▼
SQLite listings                          SQLite listings
   │                                        │
   └────────────┬───────────────────────────┘
                ▼
        /api/listings (every 30s)
                ▼
            /demo UI`}</Block>

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
              Every listing gets a 0–100 score: recency (35) + price fit (40) + proximity
              (15). Distance was 25 pts originally but was over-promoting Mission-Bay-
              cluster listings; now it's a tie-breaker rather than a primary factor.
            </P>
            <Card>
              <H3>Bands</H3>
              <Block>{`Recency (max 35)
  < 24h:  +35
  < 72h:  +25
  < 168h: +15
  else:   +5

Price fit (max 40, U-curve)
  ratio > 1.0:                                    +0   (over budget)
  price < 60% of typical for this bedroom count:  +8   (suspect — likely parse error)
  ratio ≤ 0.7:                                    +40  (good deal, realistic)
  ratio 0.7-0.8:                                  +36
  ratio 0.8-0.9:                                  +28
  ratio 0.9-1.0:                                  +18  (top of budget)

Proximity to reference point (max 15)
  < 1 km:    +15
  < 2.5 km:  +12
  < 5 km:    +9
  else:      +6`}</Block>
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
