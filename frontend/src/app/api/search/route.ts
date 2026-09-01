import { NextRequest, NextResponse } from "next/server"
import { findallCreate, findallEnrich } from "@/lib/server/parallel"
import { bedroomBounds } from "@/lib/server/listings"
import { DEFAULT_BUDGET, BLOCKED_DOMAINS } from "@/lib/server/config"
import { sanitizeDomain } from "@/lib/sources"

// Create a FindAll run. The server holds no state — the client keeps the
// returned runId and drives the poll/enrich steps.
export async function POST(req: NextRequest) {
  let body: {
    query?: string; budget?: number; city?: string; requirements?: string
    neighborhoods?: string[]; sources?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detail: "invalid JSON body" }, { status: 422 })
  }
  const query = (body.query ?? "").trim()
  if (!query) return NextResponse.json({ detail: "query is required" }, { status: 422 })

  if (!process.env.PARALLEL_API_KEY) {
    return NextResponse.json(
      { detail: "PARALLEL_API_KEY is not set on the server" }, { status: 500 },
    )
  }

  const budget = body.budget ?? DEFAULT_BUDGET
  const { min: minBeds, max: maxBeds } = bedroomBounds(query)
  // Custom domains get echoed into the FindAll prompt — accept only clean
  // hostnames, drop anything on the block list, cap the count.
  const sources = Array.isArray(body.sources)
    ? body.sources
        .map((s) => (typeof s === "string" ? sanitizeDomain(s) : null))
        .filter((d): d is string => !!d && !BLOCKED_DOMAINS.includes(d))
        .slice(0, 20)
    : null
  try {
    const { findallId, objective } = await findallCreate({
      query, budget,
      city: body.city ?? null,
      requirements: body.requirements ?? null,
      neighborhoods: Array.isArray(body.neighborhoods)
        ? body.neighborhoods.filter((n) => typeof n === "string" && n.trim()).slice(0, 8)
        : null,
      sources: sources?.length ? sources : null,
      minBeds,
    })
    // Attach the enrichment schema right away. Enrichments run on every match,
    // present and future (FindAll docs, "Adding Enrichments"), so registering
    // it here lets extraction Tasks fire as each candidate verifies instead of
    // queueing behind the whole discovery phase. Enrichment only ever touches
    // matched candidates, so this costs nothing extra — it just removes
    // discovery from the extraction critical path.
    // Best-effort: a failure here is recoverable because the client re-POSTs
    // /enrich when discovery finishes.
    let enriched = true
    try {
      await findallEnrich(findallId)
    } catch {
      enriched = false
    }
    return NextResponse.json({ runId: findallId, objective, minBeds, maxBeds, budget, sources, enriched })
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "FindAll create failed" }, { status: 502 },
    )
  }
}
