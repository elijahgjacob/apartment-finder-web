# Deployment

Two pieces to deploy:

- **Backend** (`backend/`) — FastAPI + SQLite + long-running Monitor loop. Needs a persistent container host.
- **Frontend** (`frontend/`) — Next.js application. Can deploy to Vercel or any Node.js host.

## Option 1: Docker Compose (simplest)

Run both services together:

```bash
# Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env and set PARALLEL_API_KEY

docker-compose up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000

## Option 2: Deploy Separately

### Backend — Container Host

The backend cannot run on serverless platforms because:

- SQLite needs a persistent filesystem.
- The Monitor poll loop runs continuously.
- FindAll searches can run for ~12 minutes (90 polls x 8s).

Pick a container host: **Fly.io** (recommended), Railway, Render, or Heroku.

#### Fly.io

```bash
cd backend
fly launch
fly secrets set \
    PARALLEL_API_KEY=... \
    INTERNAL_API_KEY=... \
    ALLOWED_ORIGINS=https://your-frontend.vercel.app
fly volumes create data --size 1
fly deploy
```

Mount the volume at `/backend/data` and set `SQLITE_PATH=/backend/data/listings.db`.

#### Other Hosts

Same pattern: build from `backend/Dockerfile`, mount a volume for `data/`, set the environment variables.

### Frontend — Vercel

```bash
cd frontend
vercel deploy --prod
```

Set the environment variable in Vercel:

```bash
vercel env add NEXT_PUBLIC_API_BASE production
# paste: https://your-backend.fly.dev (no trailing slash)
vercel deploy --prod   # redeploy to pick up the new env var
```

### Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PARALLEL_API_KEY` | Yes | API key from platform.parallel.ai |
| `INTERNAL_API_KEY` | No | If set, gates POST/DELETE endpoints |
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated allowed CORS origins |
| `SQLITE_PATH` | No | Path to DB file (default: `./data/listings.db`) |
| `NEXT_PUBLIC_API_BASE` | Yes (prod) | Backend URL for the frontend |

See `backend/.env.example` for all backend configuration options.

## Smoke Test

```bash
curl https://your-backend.fly.dev/api/health
curl https://your-frontend.vercel.app
```

## Limitations

- SQLite runs on a single attached volume — no horizontal scaling. Swap for Postgres/Turso for HA.
- In-flight searches live in process memory. A restart drops them.
- Read-only endpoints (`GET /api/listings`, `GET /api/monitor`) have no auth by default.
