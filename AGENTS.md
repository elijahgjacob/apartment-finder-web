# Agent Instructions — Apartment Finder Web

This is an apartment discovery application powered by the Parallel API,
deployed on Vercel as a **single Next.js app**.

## Stack

- **App**: Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui — lives in `frontend/` (this is the whole app)
- **Server logic**: Next.js serverless API routes (`frontend/src/app/api/*`) calling the Parallel API directly — no separate backend, no database, no long-lived connections
- **Search**: Parallel FindAll API for discovery + structured enrichment; Parallel Task API for the user-triggered fraud check
- `backend/` is the **legacy FastAPI implementation** — unused by the app; do not extend it

## Architecture

The client drives each search as a state machine (`use-search.ts`):
create → poll discovery → kick enrichment → poll → finalize (geocode + score)
→ optional fraud check. Every server call is a short serverless invocation.
The server holds no state; a user's saved shortlist lives only in their
browser (localStorage).

```
frontend/src/
├── app/
│   ├── api/               # Serverless API routes
│   │   ├── config/        # App config (env-driven)
│   │   ├── search/        # FindAll: create / [id] poll / enrich / finalize
│   │   ├── verify/        # Task API fraud check: create / [id] poll
│   │   └── debug/         # Stub for the /docs live tab
│   └── docs/              # Architecture docs page
├── components/            # UI components (search/, listings/, map/, reasoning/, etc.)
├── hooks/                 # use-search (search state machine), use-saved-targets
├── lib/
│   └── server/            # Parallel client, parsing/scoring, geocoding, config
├── providers/             # React context providers
└── types/                 # TypeScript type definitions
```

## Key Commands

```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Run the app at http://localhost:3000 (nothing else needed)
npm run lint         # Lint
npm run build        # Production build (also typechecks)
npx vercel deploy --prod   # Deploy to Vercel
```

## Development Notes

- Requires `PARALLEL_API_KEY` in `frontend/.env.local` (locally) or the Vercel
  project's environment variables (deployed).
- All configuration is env-driven — see `frontend/src/lib/server/config.ts`.
- Server-side code must stay serverless-safe: no in-memory state across
  requests, no long-lived work in a route (geocoding in `finalize` is the one
  long call, capped by `maxDuration = 60`).
- Read the Next.js guide in `node_modules/next/dist/docs/` before modifying
  frontend routing or data-fetching patterns — this version may differ from
  your training data.
