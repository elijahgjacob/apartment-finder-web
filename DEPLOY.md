# Deployment

Two pieces to deploy:

- **Backend** (`backend/`) — FastAPI. **Stateless**: no database, no background loops, nothing to persist. Each search runs live and streams results over SSE.
- **Frontend** (`frontend/`) — Next.js application. Deploy to Vercel or any Node.js host.

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

The backend keeps no state, so there's no volume to attach. The one constraint
is that a search streams for up to ~16 minutes over a single SSE connection, so
the host must allow long-lived responses (most serverless platforms with short
request timeouts are not a good fit).

Pick a host that supports long-running requests: **Fly.io** (recommended),
Railway, Render, or a plain VM.

#### Fly.io

```bash
cd backend
fly launch
fly secrets set \
    PARALLEL_API_KEY=... \
    INTERNAL_API_KEY=... \
    ALLOWED_ORIGINS=https://your-frontend.vercel.app
fly deploy
```

#### Other Hosts

Same pattern: build from `backend/Dockerfile`, set the environment variables.
No volumes required.

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
| `INTERNAL_API_KEY` | No | If set, gates `POST /api/tasks` via the `x-api-key` header |
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated allowed CORS origins |
| `NEXT_PUBLIC_API_BASE` | Yes (prod) | Backend URL for the frontend |

See `backend/.env.example` for all backend configuration options.

## Smoke Test

```bash
curl https://your-backend.fly.dev/api/health
curl https://your-frontend.vercel.app
```

## Notes

- **Stateless by design.** The server stores nothing between requests. A restart
  drops only in-flight searches; there is no data to lose.
- **Saved targets are client-side.** A user's shortlist is kept in their own
  browser (localStorage) and never sent to the server.
- Horizontal scaling is trivial — run as many stateless backend instances as you
  like behind a load balancer.
