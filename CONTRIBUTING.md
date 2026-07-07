# Contributing

Thanks for your interest in contributing to Apartment Finder Web.

## Prerequisites

- Python 3.12+
- Node.js 20+
- npm

## Local Development Setup

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in PARALLEL_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Or use the Makefile from the repo root:

```bash
make install   # install all deps
make dev       # run backend + frontend concurrently
```

## Architecture

### Backend — RCSR Pattern

The backend follows a Routes-Controllers-Services-Repositories architecture:

| Layer | Responsibility |
|---|---|
| `routes/` | HTTP routing and request parsing |
| `controllers/` | Request validation and response formatting |
| `services/` | Business logic and external API calls |
| `repositories/` | Data access (SQLite) |

### Frontend — Next.js App Router

The frontend uses the Next.js App Router with React Server Components:

| Directory | Purpose |
|---|---|
| `src/app/` | Pages and layouts |
| `src/components/` | Reusable UI components |
| `src/hooks/` | Custom React hooks |
| `src/lib/` | Utilities and API client |
| `src/providers/` | React context providers |

## Code Style

### Python

- **Linter/formatter**: [Ruff](https://docs.astral.sh/ruff/)
- **Type checking**: [mypy](https://mypy-lang.org/)

```bash
ruff check backend/
ruff format backend/
mypy backend/
```

### TypeScript

- **Linter**: ESLint
- **Formatter**: Prettier

```bash
cd frontend
npm run lint
npx prettier --check "src/**/*.{ts,tsx}"
```

## Pull Request Guidelines

1. Use a descriptive title that summarizes the change.
2. Reference any related issues (e.g., `Closes #42`).
3. Add or update tests for new functionality.
4. Ensure all linters and tests pass (`make lint && make test`).
5. Include screenshots for UI changes.
6. Keep PRs focused — one logical change per PR.

## Reporting Issues

Use the GitHub issue templates for [bug reports](.github/ISSUE_TEMPLATE/bug_report.yml) and [feature requests](.github/ISSUE_TEMPLATE/feature_request.yml).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
