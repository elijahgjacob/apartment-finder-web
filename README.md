# SF Apartment Finder — Web

Frontend for the SF Apartment Finder. Reads from a local SQLite `listings` table.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py      # populate sample data
uvicorn app.main:app --reload
```

Open http://localhost:8000.

## Stack

- Python 3.12+
- FastAPI + Uvicorn
- Jinja2 templates
- SQLite (via stdlib `sqlite3`)
- Tailwind CSS (CDN)

## Scoring

Each listing is scored 0–100 based on:

- **Recency** (0–35): listed within 24h / 72h / 168h / older
- **Price fit** (0–40): how far below the configured budget
- **Distance to Caltrain** (0–25): via haversine from 4th & King

Spam scoring lives in the indexer; this UI hides listings with `spam_score > 50` by default.
