# Apartment Finder Web

AI-powered apartment search that discovers and verifies real listings using the Parallel API.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/elijahgjacob/apartment-finder-web/actions/workflows/ci.yml/badge.svg)](https://github.com/elijahgjacob/apartment-finder-web/actions/workflows/ci.yml)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://python.org)
[![Node 20](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org)

<!-- TODO: Add screenshot -->

## Architecture

```mermaid
graph LR
    A[Frontend<br/>Next.js] <-->|REST + SSE| B[Backend<br/>FastAPI · stateless]
    B <-->|FindAll API| C[Parallel API]
    A -.->|saved shortlist| E[(Browser<br/>localStorage)]
```

**Stateless by design.** The backend keeps no database — each search runs live
and streams verified listings to the browser over Server-Sent Events. Nothing is
stored server-side. The only persistence is a user's saved shortlist, kept in
their own browser (localStorage) and never sent to any server.

The backend uses a **Routes-Controllers-Services** pattern. The frontend is built with the **Next.js App Router**, React 19, and Tailwind CSS.

## Features

- **Natural-language search** — describe what you want; the backend translates it into a Parallel FindAll run
- **AI verification** — each candidate is validated against configurable match conditions (beds, budget, location, availability)
- **Real-time streaming** — results stream to the frontend via Server-Sent Events as they're found, geocoded, and scored
- **Interactive map** — browse verified listings on a Leaflet map (coordinates resolved live during the search)
- **Scoring engine** — listings scored 0-100 on price fit and proximity to the reference point
- **Saved targets** — star listings you want to keep; the shortlist lives in your browser only

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm
- A [Parallel API key](https://platform.parallel.ai)

### Setup

```bash
git clone https://github.com/elijahgjacob/apartment-finder-web.git
cd apartment-finder-web

# Install dependencies
make install

# Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env and set PARALLEL_API_KEY

# Start development servers
make dev
```

The backend runs at http://localhost:8000 and the frontend at http://localhost:3000.

## Project Structure

```
apartment-finder-web/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── routes/          # HTTP route definitions
│   │   ├── controllers/     # Request validation
│   │   ├── services/        # Business logic + Parallel API
│   │   ├── models/          # Pydantic models
│   │   ├── middleware/      # Auth, CORS
│   │   └── utils/           # Helpers
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/             # Pages and layouts
│   │   ├── components/      # UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # API client, utilities
│   │   ├── providers/       # Context providers
│   │   └── types/           # TypeScript types
│   ├── public/
│   ├── next.config.ts
│   └── package.json
├── docker-compose.yml
├── Makefile
└── README.md
```

## Configuration

All backend configuration is via environment variables. See [`backend/.env.example`](backend/.env.example) for the full reference.

Key variables:

| Variable | Description |
|---|---|
| `PARALLEL_API_KEY` | API key from platform.parallel.ai (required) |
| `SEARCH_QUERY` | Default search query shown in the UI |
| `SEARCH_BUDGET` | Default maximum monthly rent |
| `CITY` / `CITY_SHORT` | Default city a search targets (users can override per search) |

## Available Commands

| Command | Description |
|---|---|
| `make dev` | Run backend and frontend concurrently |
| `make install` | Install all dependencies |
| `make lint` | Lint backend and frontend |
| `make test` | Run all tests |
| `make fmt` | Auto-format all code |
| `make build` | Build the frontend for production |
| `make clean` | Remove build artifacts |

## Deployment

See [DEPLOY.md](DEPLOY.md) for deployment instructions including Docker Compose, Fly.io, and Vercel options.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
