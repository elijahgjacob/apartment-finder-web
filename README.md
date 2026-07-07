# SF Apartment Finder — Web

AI-powered apartment search for San Francisco. Uses Parallel's FindAll API to discover and verify real listings, then streams results in real-time.

## Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
cd ..

# Configure
cp .env.example .env
# Set PARALLEL_API_KEY in .env
```

## Run (dev)

Start both the API and the frontend dev server:

```bash
# Terminal 1 — FastAPI backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Vite frontend
cd frontend
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api/*` to FastAPI).

## Stack

- **Backend**: Python, FastAPI, SQLite
- **Search**: Parallel FindAll API (`parallel-cli`) for structured entity discovery
- **Frontend**: React, Vite, Tailwind CSS v4, shadcn/ui, Leaflet
- **Streaming**: SSE (Server-Sent Events) for real-time progress + results

## How it works

1. On startup, a background loop searches for apartments every 5 minutes
2. FindAll discovers candidates across Zillow, Redfin, Apartments.com, Craigslist, etc.
3. Each candidate is verified against match conditions (beds, budget, location, availability)
4. Verified listings stream to the frontend via SSE and appear on the map + cards
5. Results persist in SQLite — the UI auto-refreshes every 30 seconds
6. Manual searches are also supported via the search bar

## Environment

| Variable | Default | Description |
|---|---|---|
| `PARALLEL_API_KEY` | (required) | API key from parallel.ai |
| `SEARCH_QUERY` | `3BR apartments for rent in San Francisco near Caltrain` | Default background search |
| `SEARCH_BUDGET` | `7500` | Max monthly rent |
| `SEARCH_INTERVAL_SECONDS` | `300` | Background search interval |

## Scoring

Each listing is scored 0–100 based on:

- **Recency** (0–35): listed within 24h / 72h / 168h / older
- **Price fit** (0–40): how far below the configured budget
- **Distance to Caltrain** (0–25): via haversine from 4th & King
