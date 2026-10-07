"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { api } from "@/lib/api"
import type { Listing } from "@/types"

export type SearchPhase = { key: "discover" | "extract" | "finalize" | "done"; detail: string }

type PollResponse = {
  state: string
  generated: number
  matched: number
  rentPopulated: number
  candidateCount: number
  dropped?: number
  listings: Listing[]
}

const POLL_MS = 4000
// Wall-clock budget for one pass, enforced by elapsed time rather than a poll
// count (poll latency varies, so a count is not a duration). Reaching it is no
// longer an error: the pass finalizes with whatever the run produced.
const RUN_MAX_MS = 480_000 // 8 min
const MAX_POLLS = Math.ceil(RUN_MAX_MS / POLL_MS) // belt-and-braces loop bound
// Enrichment is the slow phase (a Task per matched candidate) and ripens
// gradually. Waiting for EVERY candidate to enrich pushed a full search to
// ~5 min, so we finalize once ENRICH_ENOUGH listings have enriched rent (a
// full page's worth survives filtering) rather than waiting for the whole
// batch — the tail candidates rarely change the shown results.
const ENRICH_ENOUGH = 8
// Escape hatch when enrichment drags. Two things set this number. It has to
// clear the time enrichment actually needs — a 120s cap fired before any rent
// existed and, combined with the old rentPopulated >= 1 guard, deadlocked the
// pass into a timeout. And because discovery is the slow half (~1 candidate per
// 10s), this cap is what usually decides how many listings a search shows: a
// 10-query browser sweep finalized at a median of 2 listings on a 240s cap.
// Cards stream into the grid as they verify, so the extra minute is visible
// progress rather than dead time.
const ENRICH_MAX_WAIT_MS = 300_000
// FindAll only reports `completed` once it fills match_limit OR exhausts the
// web, which a slow run may not do for ~10 minutes. Once discovery has run this
// long with at least one match, hand over to the enrichment phase rather than
// waiting for `completed`. Enrichment registers at run creation and runs
// concurrently with discovery, so handing over earlier buys no speed — it just
// finalizes a thinner match set.
const DISCOVER_MAX_WAIT_MS = 120_000
// A query with no inventory has to be told apart from one that is merely slow,
// and wall-clock alone cannot do it — first-match latency of 100s+ is normal and
// stretches further under concurrent load. Abort only when discovery has stopped
// making progress: nothing verified AND no new candidate generated for this long.
// Kept above the slowest observed cold start: FindAll generated its first
// candidate 60-90s after create across several measured runs, so a shorter
// stall window would abort a run that had simply not warmed up yet.
const DISCOVER_STALL_MS = 120_000
// Start enrichment as soon as discovery has this many verified matches, rather
// than waiting for the full match_limit pool — the extra tail candidates mostly
// don't change the shown page and just add latency.
const DISCOVER_ENOUGH = 15
// For a run that escaped discovery (never `completed`), we can't use the run
// state to tell that enrichment finished. Instead finalize once enrichment has
// settled — no newly-populated rent for this long — so we don't sit on the
// full ENRICH_MAX_WAIT_MS for a small candidate set that's already done.
const ENRICH_SETTLE_MS = 15_000
// ...but only once enrichment has had a fair chance to start producing. Without
// this floor, "no new rent for 15s" fires while the first Task is still running.
const ENRICH_MIN_WAIT_MS = 60_000
// Discovery is run-to-run variable: a thin neighborhood occasionally returns a
// junk-heavy candidate set and finalizes near-empty. Rather than give up, run
// one fresh FindAll pass before showing the user (near-)nothing.
const LOW_YIELD_RETRY_THRESHOLD = 2
// A second pass only fits inside a sane wall-clock if the first one was quick.
// Only reached when the first pass produced (near-)nothing, so the extra wait
// buys the difference between an empty grid and a real answer. Keep this above
// ENRICH_MAX_WAIT_MS: a first pass that rides the enrichment cap lands just
// past it, and gating below the cap is what made this retry dead code before.
const LOW_YIELD_RETRY_MAX_ELAPSED_MS = 330_000
// Poll failures are transient often enough to retry, but a persistent upstream
// error (bad key, rate limit, provider outage) must surface as itself rather
// than as a timeout after several silent minutes.
const POLL_FAIL_LIMIT = 5
const VERIFY_POLL_MS = 5000
const VERIFY_MAX_POLLS = 24 // ~2 min per listing

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Task-API fraud check: verify each flagged listing's fact-based scam
// signals and fold the verdict back into the rendered cards.
async function verifyListings(
  all: Listing[],
  live: () => boolean,
  say: (text: string) => void,
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>,
) {
  const targets = all.filter((l) => l.needs_verification)
  if (!targets.length) return
  say(`\nFraud check: verifying ${targets.length} untrusted-source listing${targets.length === 1 ? "" : "s"} via Task API…\n`)

  await Promise.all(targets.map(async (l) => {
    try {
      const { runId } = await fetchJson<{ runId: string }>(api("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: l.title, body: l.body, price: l.price, address: l.address, source: l.source,
        }),
      })
      for (let i = 0; i < VERIFY_MAX_POLLS; i++) {
        await sleep(VERIFY_POLL_MS)
        if (!live()) return
        const v = await fetchJson<{ done: boolean; spamScore?: number; flags?: string[] }>(
          api(`/api/verify/${runId}`),
        ).catch(() => null)
        if (!v) continue
        if (!v.done) continue
        const score = v.spamScore ?? 0
        const flags = v.flags ?? []
        if (!live()) return
        setListings((prev) => prev.map((x) =>
          x.id === l.id ? { ...x, spam_score: score, spam_flags: flags, needs_verification: false } : x,
        ))
        if (score > 0) {
          say(`  ⚠ ${l.address ?? l.title ?? "listing"} · spam:${score} (${flags.join(", ")})\n`)
        }
        return
      }
    } catch {
      // Verification is best-effort; the card simply keeps spam_score 0.
    }
  }))
  if (live()) say("Fraud check complete.\n")
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as { detail?: string }))
    throw new Error((j as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// Serverless-friendly search: create a FindAll run, then drive it from the
// client — poll discovery, kick enrichment, poll again, finalize (geocode +
// score). The server holds no state; this hook owns the whole lifecycle.
export function useSearch() {
  const [query, setQuery] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [phase, setPhase] = useState<SearchPhase | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  // Live run metrics for the discovery visualization: candidates generated,
  // verified matches, enriched-and-ready, and total candidates.
  const [progress, setProgress] = useState({ generated: 0, matched: 0, ready: 0, total: 0, dropped: 0 })
  const [fraudChecking, setFraudChecking] = useState(false)
  // Bumped on every new search and on unmount so an abandoned loop exits.
  const genRef = useRef(0)
  // Mirror of `listings` so runFraudCheck can read the current set without
  // re-creating its callback on every update.
  const listingsRef = useRef<Listing[]>([])
  useEffect(() => { listingsRef.current = listings }, [listings])

  const startSearch = useCallback(async (
    q: string,
    budget: number,
    opts: { city?: string; requirements?: string; neighborhoods?: string[]; sources?: string[] } = {},
  ) => {
    if (!q.trim()) return
    const gen = ++genRef.current
    const live = () => genRef.current === gen

    setReasoning("")
    setListings([])
    setError(null)
    setDone(false)
    setStreaming(true)
    setPhase({ key: "discover", detail: "Starting…" })
    setStartedAt(Date.now())
    setProgress({ generated: 0, matched: 0, ready: 0, total: 0, dropped: 0 })

    const say = (text: string) => { if (live()) setReasoning((p) => p + text) }
    const fail = (msg: string) => {
      if (!live()) return
      setStreaming(false)
      setError(msg)
    }

    const searchStartedAt = Date.now()

    // One full discovery → enrich → finalize pass against a fresh FindAll run.
    // Returns the finalized listings, or null if the run hard-failed or timed
    // out (fail() has already surfaced the error). The terminal "done" state is
    // set by the caller so a thin first pass can be retried transparently.
    const driveRun = async (attempt: number): Promise<{ listings: Listing[]; completed: boolean } | null> => {
      // 1) Create the run (each attempt is a brand-new FindAll run).
      const body: Record<string, unknown> = { query: q, budget }
      if (opts.city) body.city = opts.city
      if (opts.requirements) body.requirements = opts.requirements
      if (opts.neighborhoods?.length) body.neighborhoods = opts.neighborhoods
      if (opts.sources?.length) body.sources = opts.sources
      const created = await fetchJson<{
        runId: string; objective: string; minBeds: number | null; maxBeds: number | null
        enriched?: boolean
      }>(
        api("/api/search"),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      )
      if (!live()) return null
      const { runId, objective, minBeds, maxBeds } = created
      // The create route already registered the enrichment schema, so
      // extraction Tasks are running alongside discovery. The enrichment clock
      // therefore starts now, not when discovery hands over.
      const enrichedAtCreate = created.enriched !== false

      if (attempt === 1) {
        say(`Objective: ${objective}\n`)
        say(`Budget: $${budget.toLocaleString()}/mo`)
        if (minBeds) say(` · ${minBeds}+ beds`)
      }
      say(`\n\nStarting entity discovery…\nRun: ${runId}\nSearching and verifying candidates…\n\n`)

      // City rides along on every poll/finalize call so the stateless server
      // can score with the right per-city floors and proximity anchor.
      // (Sources are an include hint applied only at create time.)
      const cityParam = opts.city ? `&city=${encodeURIComponent(opts.city)}` : ""
      const maxBedsParam = maxBeds != null ? `&maxBeds=${maxBeds}` : ""
      const pollUrl = api(
        `/api/search/${runId}?budget=${budget}${minBeds ? `&minBeds=${minBeds}` : ""}${cityParam}${maxBedsParam}`,
      )

      // 2) Drive the run: discover → enrich → extract → finalize.
      let enrichStarted = false
      let enrichStartedAt = 0
      let prevGenerated = -1
      let prevMatched = -1
      let prevReady = -1
      let prevTotal = 0
      let discoverCompleted = false
      let lastReadyChangeAt = 0
      let pollFails = 0
      let lastGeneratedSeen = -1
      // Always set by the first successful poll (generated can never be -1).
      let lastGeneratedChangeAt = 0
      const runStartedAt = Date.now()
      const discoverStartedAt = runStartedAt
      const seenIds = new Set<string>()

      // Add newly verified listings to the UI in live time; enrichment
      // updates existing cards in place (ids are stable listing URLs).
      const mergeIncoming = (incoming: Listing[]) => {
        for (const l of incoming) {
          if (!seenIds.has(l.id)) {
            seenIds.add(l.id)
            say(`  + verified: ${l.address ?? l.title ?? l.url}\n`)
          }
        }
        setListings((prev) => {
          const byId = new Map(prev.map((x) => [x.id, x]))
          const merged = [...prev]
          for (const l of incoming) {
            const existing = byId.get(l.id)
            if (!existing) {
              merged.push(l)
            } else {
              const idx = merged.findIndex((x) => x.id === l.id)
              // Keep client-side fields (coords, spam verdicts) if already set.
              merged[idx] = {
                ...existing, ...l,
                lat: existing.lat ?? l.lat,
                lng: existing.lng ?? l.lng,
                spam_score: existing.spam_score || l.spam_score,
                spam_flags: existing.spam_flags ?? l.spam_flags,
              }
            }
          }
          return merged
        })
      }

      // Geocode + score everything discovered so far and hand it back. Called
      // both on the normal path and when the pass runs out of wall-clock, so a
      // slow run degrades to "fewer listings" instead of a hard error.
      const finalizeRun = async (): Promise<{ listings: Listing[]; completed: boolean } | null> => {
        setPhase({ key: "finalize", detail: "Mapping & scoring listings…" })
        say("\nMapping & scoring…\n")
        const fin = await fetchJson<{ listings: Listing[] }>(
          api(`/api/search/${runId}/finalize?budget=${budget}${minBeds ? `&minBeds=${minBeds}` : ""}${cityParam}${maxBedsParam}`),
        )
        if (!live()) return null
        for (const l of fin.listings) {
          const price = l.price ? `$${l.price.toLocaleString()}/mo` : "n/a"
          const bd = l.bedrooms != null ? `${l.bedrooms}bd` : "?bd"
          say(`  + ${l.address ?? "no address"} · ${bd} · ${price}\n`)
        }
        return { listings: fin.listings, completed: discoverCompleted }
      }

      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS)
        if (!live()) return null
        if (Date.now() - runStartedAt > RUN_MAX_MS) break

        let poll: PollResponse
        try {
          poll = await fetchJson<PollResponse>(pollUrl)
          pollFails = 0
        } catch (e) {
          // Transient failures are common; a run of them is a real upstream
          // error and gets surfaced as itself.
          if (++pollFails >= POLL_FAIL_LIMIT) {
            fail(e instanceof Error ? e.message : "the search service stopped responding")
            return null
          }
          continue
        }
        if (!live()) return null

        // Terminal failure from the search provider (e.g. FindAll run errored
        // or was cancelled). Surface it immediately instead of polling until
        // the timeout — otherwise the UI just spins for minutes.
        if (poll.state === "failed" || poll.state === "cancelled" || poll.state === "error") {
          fail("The search service hit an error on this run (it may be rate-limited or over quota). Please try again in a bit.")
          return null
        }

        if (poll.generated !== lastGeneratedSeen) {
          lastGeneratedSeen = poll.generated
          lastGeneratedChangeAt = Date.now()
        }

        if (poll.listings.length) mergeIncoming(poll.listings)

        setProgress({
          generated: poll.generated,
          matched: poll.matched,
          ready: poll.rentPopulated,
          total: poll.candidateCount,
          dropped: poll.dropped ?? 0,
        })

        if (!enrichStarted) {
          if (poll.generated !== prevGenerated || poll.matched !== prevMatched) {
            say(`Progress: ${poll.generated} found, ${poll.matched} verified\n`)
            setPhase({
              key: "discover",
              detail: `Verifying candidates · ${poll.generated} found · ${poll.matched} match`,
            })
            prevGenerated = poll.generated
            prevMatched = poll.matched
          }
          // Proceed to enrichment when discovery completes, when it already has
          // a healthy set of matches (no need to wait for the full pool to
          // start extracting), OR when it has run long enough with at least one
          // match (a rare query may never fill match_limit and never report
          // `completed` — don't hang on it).
          const discoverElapsed = Date.now() - discoverStartedAt
          const discoverEnough = poll.matched >= DISCOVER_ENOUGH
          const discoverTimedOut =
            discoverElapsed > DISCOVER_MAX_WAIT_MS && poll.matched >= 1
          // Nothing verified and no new candidates coming in: the query has no
          // inventory to enrich, so stop rather than burning the rest of the
          // budget. A run still generating candidates is slow, not dead.
          const discoveryStalled = Date.now() - lastGeneratedChangeAt > DISCOVER_STALL_MS
          if (discoverElapsed > DISCOVER_MAX_WAIT_MS && poll.matched < 1 && discoveryStalled) {
            fail("No listings matched this search. Try a higher budget, a bigger neighborhood, or fewer requirements.")
            return null
          }
          if (poll.state === "completed" || discoverEnough || discoverTimedOut) {
            if (poll.state !== "completed") {
              say(`\nProceeding with ${poll.matched} verified so far…\n`)
            } else {
              say(`\nVerified ${poll.matched}. Extracting listing details…\n`)
            }
            setPhase({ key: "extract", detail: "Extracting price, beds & address…" })
            if (!enrichedAtCreate) {
              try {
                await fetchJson(api(`/api/search/${runId}/enrich`), { method: "POST" })
              } catch (e) {
                fail(e instanceof Error ? e.message : "enrichment failed")
                return null
              }
            }
            enrichStarted = true
            enrichStartedAt = enrichedAtCreate ? runStartedAt : Date.now()
            lastReadyChangeAt = Date.now()
            // Did discovery reach `completed` (filled/exhausted), or did we bail
            // out early? Drives whether a thin result is worth retrying.
            discoverCompleted = poll.state === "completed"
            await sleep(POLL_MS) // let the enrich job flip status to running
          }
          continue
        }

        // Enrichment phase: narrate fill-in progress; wait for it to complete
        // so enough listings survive filtering (finalizing at the first ready
        // listing yielded zero results). The time-based escape hatch only
        // fires if enrichment drags on with a hung straggler.
        const total = poll.candidateCount || 1
        // The banner shows ready/total, so it has to be rewritten when EITHER
        // number moves. Gating it on `rentPopulated` alone froze the
        // denominator at whatever the candidate pool held on the last poll
        // that ripened a listing: a run sitting at 0 ready kept showing the
        // first poll's "0/1" while the pool grew to 4, contradicting the
        // reasoning panel, which reads the live count.
        if (poll.rentPopulated !== prevReady || total !== prevTotal) {
          if (poll.rentPopulated !== prevReady) {
            say(`Extracting details… ${poll.rentPopulated}/${total} ready\n`)
            lastReadyChangeAt = Date.now()
          }
          setPhase({ key: "extract", detail: `Extracting details · ${poll.rentPopulated}/${total} ready` })
          prevReady = poll.rentPopulated
          prevTotal = total
        }
        // Enough enriched to show a full page: finalize without waiting for the
        // long tail of the batch to enrich. The target scales down for a small
        // match set (don't wait for 12 when only 8 matched).
        const enrichElapsed = Date.now() - enrichStartedAt
        // Scaling the target down to the match count is only safe once discovery
        // has actually finished. Enrichment now runs concurrently with
        // discovery, so a pool still climbing (2 matches at handover, 10 a
        // minute later) would otherwise satisfy `2 >= min(2, 8)` and finalize a
        // page of two. A pool that genuinely tops out below ENRICH_ENOUGH rides
        // enrichTimedOut instead and finalizes with everything it found.
        const enrichEnough = poll.rentPopulated >= ENRICH_ENOUGH ||
          (discoverCompleted && poll.rentPopulated >= Math.min(poll.matched || poll.candidateCount || 1, ENRICH_ENOUGH))
        // Deliberately NOT gated on rentPopulated. Enrichment legitimately
        // returns an empty rent for a page that shows no price, so a run whose
        // candidates all lack a rent used to leave every escape hatch false and
        // poll to the timeout with usable listings already on screen.
        const enrichTimedOut = enrichElapsed > ENRICH_MAX_WAIT_MS
        // A run that never `completed` won't ever report enrichment done via
        // state, so finalize once every candidate is populated OR enrichment
        // has settled (no new rents for ENRICH_SETTLE_MS, after a floor that
        // keeps "settled" from firing before the first Task returns). Only for
        // escaped runs — a normally-completing run still waits for `completed`.
        const enrichSettled = !discoverCompleted && poll.rentPopulated >= 1 &&
          enrichElapsed > ENRICH_MIN_WAIT_MS &&
          (poll.rentPopulated >= poll.candidateCount ||
            Date.now() - lastReadyChangeAt > ENRICH_SETTLE_MS)
        if (poll.state !== "completed" && !enrichEnough && !enrichTimedOut && !enrichSettled) continue
        if (poll.state !== "completed") {
          say(`\nFinalizing ${poll.rentPopulated} ready now.\n`)
        }

        // 3) Finalize: geocode + score everything in one server call.
        return finalizeRun()
      }

      // Out of wall-clock. Anything verified so far is still a real answer, so
      // finalize it instead of throwing the pass away behind a timeout error.
      if (seenIds.size > 0) {
        say(`\nSearch is taking unusually long. Showing the ${seenIds.size} listing${seenIds.size === 1 ? "" : "s"} found so far.\n`)
        return finalizeRun()
      }
      fail("No listings found for this search. Try a higher budget, a bigger neighborhood, or fewer requirements.")
      return null
    }

    try {
      const first = await driveRun(1)
      if (!live()) return
      if (first === null) return // hard failure/timeout already surfaced
      let result = first.listings

      // Thin first pass: retry once with a fresh run before giving up, keeping
      // whichever pass surfaced more. Only when discovery actually COMPLETED —
      // a run that bailed early (rare/over-constrained query that never fills
      // match_limit) is legitimately near-empty, so a second pass just doubles
      // latency for the same answer.
      // Gated on elapsed time, not on `first.completed`: FindAll only reports
      // `completed` once it fills match_limit, which a slow run never does, so
      // the old gate made this retry dead code. Time is also the constraint
      // that matters — a second pass is only worth it if the first was quick.
      const firstPassMs = Date.now() - searchStartedAt
      if (result.length < LOW_YIELD_RETRY_THRESHOLD && firstPassMs < LOW_YIELD_RETRY_MAX_ELAPSED_MS) {
        say(`\nOnly ${result.length} listing${result.length === 1 ? "" : "s"} so far. Retrying discovery once for more…\n`)
        setListings([])
        const retry = await driveRun(2)
        if (!live()) return
        if (retry && retry.listings.length > result.length) result = retry.listings
        // The first pass already succeeded, so a failed retry must not surface
        // an error over the usable results we do have — clear it and show them.
        setError(null)
      }

      say(`\nDone. ${result.length} listings found.\n`)
      setListings(result)
      setPhase({ key: "done", detail: `${result.length} listing${result.length === 1 ? "" : "s"} found` })
      setStreaming(false)
      setDone(true)
    } catch (err) {
      fail(err instanceof Error ? err.message : "Search failed")
    }
  }, [])

  // User-triggered second run: fraud-check the current results via the
  // Task API. Badges on the cards update live as verdicts land.
  const runFraudCheck = useCallback(async () => {
    const gen = genRef.current
    const live = () => genRef.current === gen
    const say = (text: string) => { if (live()) setReasoning((p) => p + text) }
    const targets = listingsRef.current.filter((l) => l.needs_verification)
    if (!targets.length || fraudChecking) return
    setFraudChecking(true)
    try {
      await verifyListings(listingsRef.current, live, say, setListings)
    } finally {
      if (live()) setFraudChecking(false)
    }
  }, [fraudChecking])

  // Abandon any in-flight loop when the component unmounts.
  useEffect(() => () => { genRef.current++ }, [])

  return {
    query, setQuery,
    reasoning, streaming, listings, error, done, phase, startedAt, progress,
    fraudChecking, runFraudCheck,
    startSearch, setError,
  } as const
}
