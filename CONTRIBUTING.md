# Contributing

Thanks for your interest in contributing to Apartment Finder Web.

## Prerequisites

- Node.js 20+
- A [Parallel API key](https://platform.parallel.ai)

## Local development

The app is a single Next.js project in `frontend/`; there is nothing else to run.

```bash
cd frontend
npm install
echo "PARALLEL_API_KEY=your-key-here" > .env.local
npm run dev        # http://localhost:3000
```

## Checks

```bash
cd frontend
npm run lint       # ESLint
npm run build      # production build (also typechecks)
```

Please run both before opening a PR, and test user-facing changes in a browser
(mobile viewport included) rather than relying on the build alone.

## Style

- TypeScript throughout; match the surrounding code's conventions.
- Visual changes follow the Parallel design system already encoded in
  `frontend/src/lib/palette.ts` (off-white background, index black text,
  signal orange as a sparing accent, Geist / Geist Mono).
- Keep server code serverless-safe: no in-memory state across requests.
