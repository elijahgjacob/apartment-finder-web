# SF Apartment Finder — Web

Frontend for the SF Apartment Finder. Reads from the same Postgres `listings` table populated by the indexer in [`elijahgjacob/apartment-finder`](https://github.com/elijahgjacob/apartment-finder).

## Setup

```bash
cp .env.example .env.local
# set POSTGRES_URL to the same connection string the indexer writes to
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy (Vercel)

```bash
vercel
vercel env add POSTGRES_URL production
vercel --prod
```

## Stack

- Next.js 16 (App Router, server components)
- React 19
- Tailwind CSS v4
- `pg` for Postgres

## Scoring

Each listing is scored 0–100 based on:

- **Recency** (0–35): listed within 24h / 72h / 168h / older
- **Price fit** (0–40): how far below the configured budget
- **Distance to Caltrain** (0–25): via haversine from 4th & King

Spam scoring lives in the indexer; this UI hides listings with `spam_score > 50` by default.
