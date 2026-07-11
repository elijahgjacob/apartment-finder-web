import { NextRequest, NextResponse } from "next/server"
import { findallCreate } from "@/lib/server/parallel"
import { extractMinBeds } from "@/lib/server/listings"
import { DEFAULT_BUDGET } from "@/lib/server/config"

// Create a FindAll run. The server holds no state — the client keeps the
// returned runId and drives the poll/enrich steps.
export async function POST(req: NextRequest) {
  let body: { query?: string; budget?: number; city?: string; requirements?: string }
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
  const minBeds = extractMinBeds(query)
  try {
    const { findallId, objective } = await findallCreate({
      query, budget,
      city: body.city ?? null,
      requirements: body.requirements ?? null,
      minBeds,
    })
    return NextResponse.json({ runId: findallId, objective, minBeds, budget })
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "FindAll create failed" }, { status: 502 },
    )
  }
}
