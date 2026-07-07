# Deploying

Two pieces:
- **Frontend** — Vercel-hosted static build (React/Vite output).
- **Backend** — FastAPI + SQLite + a long-running Monitor poll loop.
  Cannot run on Vercel; needs a real container host.

## 1. Backend (must deploy first)

Vercel can't host this backend because:
- SQLite needs a persistent filesystem; Vercel functions are ephemeral.
- The Monitor poll loop runs forever; serverless functions are bounded.
- A FindAll search runs for ~12 minutes (90 polls × 8s); that exceeds
  the function-duration cap on most tiers.

Pick one of these container hosts:

### Option A — Fly.io (recommended for low ops)

```sh
brew install flyctl
fly launch --image-from-dockerfile  # see Dockerfile section below
fly secrets set \
    PARALLEL_API_KEY=... \
    INTERNAL_API_KEY=... \
    ALLOWED_ORIGINS=https://your-frontend.vercel.app
fly deploy
fly volumes create data --size 1   # 1 GB persistent volume for SQLite
```

Mount the volume at `/app/data` and set `SQLITE_PATH=/app/data/listings.db`.

### Option B — Railway / Render / Heroku

Same pattern: build the Docker image, mount a volume for `data/`, set the
env vars listed below.

### Required env vars

| Var | Purpose |
|---|---|
| `PARALLEL_API_KEY` | Required. Provisioned at platform.parallel.ai |
| `INTERNAL_API_KEY` | Optional. If set, `POST /api/tasks` and `POST /api/monitor` require this header. |
| `ALLOWED_ORIGINS` | **Critical.** Comma-separated list of origins allowed to make API calls. Must include the Vercel frontend URL. e.g. `https://your-frontend.vercel.app,http://localhost:5173`. |
| `SQLITE_PATH` | Path to the persistent DB file. Default `./data/listings.db`. |

Plus all the brand / search / scoring vars in `.env.example`.

### Dockerfile (drop into repo root)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 2. Frontend on Vercel

Already deployed via `vercel deploy` from `frontend/`. Two steps to make it work:

```sh
# 1. Tell the frontend where the backend is
vercel env add VITE_API_BASE production
# paste: https://your-backend.fly.dev (no trailing slash)

# 2. Redeploy so the env var is baked into the build
cd frontend && vercel deploy --prod
```

The `VITE_API_BASE` variable is consumed in `src/lib/api.ts` and prepended
to every `/api/*` fetch + EventSource URL. Empty string in dev (Vite
proxy handles it); full URL in prod.

## 3. Smoke test

```sh
curl https://your-backend.fly.dev/api/config | jq .brand
curl https://your-frontend.vercel.app                 # loads the SPA
```

Visit the frontend URL. If you see "Backend unreachable", the issue is
either:
- `VITE_API_BASE` not set / set to the wrong URL → check Vercel env vars
- `ALLOWED_ORIGINS` on the backend doesn't include the Vercel origin →
  check backend env

## What's NOT included in this stack

- No CDN for SQLite — the DB lives on a single attached volume. For
  high availability, swap SQLite for Vercel Postgres / Supabase / Turso.
- No queue for FindAll runs — they live in the FastAPI process memory
  (`_tasks` dict). A restart drops in-flight searches.
- No auth on `/api/listings` (read-only) or `/api/monitor` (GET) —
  add it before exposing publicly. `INTERNAL_API_KEY` only gates the
  POST/DELETE endpoints today.
