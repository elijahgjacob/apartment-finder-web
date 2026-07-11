import { NextRequest, NextResponse } from "next/server"
import { findallResult } from "@/lib/server/parallel"
import { parseCandidates, scoreListing } from "@/lib/server/listings"
import { geocodeAddress } from "@/lib/server/geocode"
import { DEFAULT_BUDGET } from "@/lib/server/config"
import { TRUSTED_SOURCES } from "@/lib/server/verify"

// Geocoding runs sequentially (~1/s per Nominatim policy) for up to
// FINDALL_MATCH_LIMIT listings, so allow more than the default duration.
export const maxDuration = 60

// Final step after enrichment completes: parse everything, geocode each
// address, and return the fully scored listings.
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
  const city = sp.get("city")

  try {
    const candidates = await findallResult(id)
    const listings = parseCandidates(candidates, minBeds, budget)

    for (const l of listings) {
      if (!l.address) continue
      const coords = await geocodeAddress(l.address, city)
      if (coords) {
        l.lat = coords.lat
        l.lng = coords.lng
        l.score = scoreListing(l, budget) // re-score with proximity known
      }
      // Nominatim rate limit: ~1 request/second.
      await new Promise((r) => setTimeout(r, 1050))
    }

    // Flag untrusted-source listings for the client-driven Task API
    // secondary verification (same flags as the original spam check).
    const withVerify = listings.map((l) => ({
      ...l,
      needs_verification: !TRUSTED_SOURCES.has(l.source),
    }))
    return NextResponse.json({ listings: withVerify })
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "finalize failed" }, { status: 502 },
    )
  }
}
