import { NextRequest, NextResponse } from "next/server"
import { findallResult, findallStatus } from "@/lib/server/parallel"
import { parseCandidates, parseOptionsFrom } from "@/lib/server/listings"
import { DEFAULT_BUDGET } from "@/lib/server/config"

// One short poll: run state + metrics + the listings parsed so far.
// budget/minBeds come from the client (the server keeps no state).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!/^findall_[a-f0-9]+$/.test(id)) {
    return NextResponse.json({ detail: "invalid run id" }, { status: 422 })
  }
  const sp = req.nextUrl.searchParams
  const budget = Number(sp.get("budget")) || DEFAULT_BUDGET
  const minBedsRaw = sp.get("minBeds")
  const minBeds = minBedsRaw ? Number(minBedsRaw) || null : null

  try {
    const [status, candidates] = await Promise.all([
      findallStatus(id),
      findallResult(id).catch(() => []),
    ])
    // FindAll marks a candidate matched; the parser then rejects the ones that
    // are not usable individual listings (category/index pages, no street
    // address, blocked host, duplicate address). Those rejections are why the
    // panel's "N match your criteria" can outrun the number of cards on screen,
    // so report the count instead of discarding it.
    const drops: Record<string, number> = {}
    const listings = parseCandidates(candidates, minBeds, budget, parseOptionsFrom(sp), drops)
    const dropped = Object.values(drops).reduce((a, b) => a + b, 0)
    // How many candidates have enriched rent values — lets the client tell
    // "discovery done" apart from "enrichment done" (both report completed).
    const rentPopulated = candidates.filter((c) => {
      const rent = c.output?.monthly_rent_usd
      return rent != null && String(rent.value ?? "").trim() !== ""
    }).length
    return NextResponse.json({
      state: status.state,
      generated: status.generated,
      matched: status.matched,
      rentPopulated,
      candidateCount: candidates.length,
      dropped,
      listings,
    })
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "poll failed" }, { status: 502 },
    )
  }
}
