# Agent Instructions — Apartment Finder Web

This is a full-stack apartment discovery application powered by the Parallel API.

## Stack

- **Backend**: Python 3.12, FastAPI, SQLite — lives in `backend/`
- **Frontend**: Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui — lives in `frontend/`
- **Search**: Parallel FindAll API for structured web search and monitoring

## Backend Architecture (RCSR)

The backend follows a Routes-Controllers-Services-Repositories pattern:

```
backend/app/
├── routes/          # HTTP route definitions
├── controllers/     # Request validation, response formatting
├── services/        # Business logic, Parallel API integration
├── repositories/    # SQLite data access
├── models/          # Pydantic models and schemas
├── middleware/      # Auth and CORS
└── utils/           # Shared helpers
```

## Frontend Architecture

```
frontend/src/
├── app/             # Next.js App Router pages and layouts
├── components/      # UI components (search/, listings/, map/, reasoning/, etc.)
├── hooks/           # Custom React hooks (use-listings, use-monitor, etc.)
├── lib/             # API client, utilities
├── providers/       # React context providers
└── types/           # TypeScript type definitions
```

## Key Commands

```bash
make dev             # Run backend + frontend concurrently
make install         # Install all dependencies
make lint            # Lint both backend and frontend
make test            # Run all tests
make fmt             # Auto-format all code
```

## Development Notes

- Backend API runs on port 8000, frontend on port 3000.
- The backend integrates with the Parallel API for web search and monitoring. Requires `PARALLEL_API_KEY` in `backend/.env`.
- SQLite database is stored at `backend/data/listings.db` by default.
- See `backend/.env.example` for all configuration options.
- Read the Next.js guide in `node_modules/next/dist/docs/` before modifying frontend routing or data-fetching patterns — this version may differ from your training data.
