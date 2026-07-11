import { NextResponse } from "next/server"

// Serverless functions share no memory, so the old in-process ring buffer of
// API calls doesn't exist here. Keep the endpoint so the /docs live tab
// degrades gracefully instead of erroring.
export async function GET() {
  return NextResponse.json({
    calls: [],
    stats: { total: 0, errors: 0, buffer_size: 0 },
    note: "API-call tracing is unavailable in the serverless deployment.",
  })
}
