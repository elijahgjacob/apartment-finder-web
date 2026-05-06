#!/usr/bin/env python3
"""Seed the SQLite database with sample apartment listings."""

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "listings.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(str(DB_PATH))
conn.execute("PRAGMA journal_mode=WAL")

conn.executescript("""
    CREATE TABLE IF NOT EXISTS listings (
        id            TEXT PRIMARY KEY,
        source        TEXT NOT NULL DEFAULT '',
        title         TEXT,
        url           TEXT,
        price         INTEGER,
        bedrooms      INTEGER,
        bathrooms     REAL,
        sqft          INTEGER,
        address       TEXT,
        neighborhood  TEXT,
        lat           REAL,
        lng           REAL,
        has_parking   INTEGER,
        has_laundry   INTEGER,
        spam_score    INTEGER NOT NULL DEFAULT 0,
        spam_flags    TEXT NOT NULL DEFAULT '[]',
        body          TEXT,
        listed_at     TEXT NOT NULL DEFAULT (datetime('now')),
        fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
        is_active     INTEGER NOT NULL DEFAULT 1
    );
""")

now = datetime.now(timezone.utc)

LISTINGS = [
    dict(source="craigslist", title="Sunny 3BR in Mission District", price=4200, bedrooms=3, bathrooms=2, sqft=1350, address="2847 Mission St", neighborhood="Mission", lat=37.7520, lng=-122.4185, parking=0, laundry=1, spam=5, hours=4),
    dict(source="craigslist", title="Renovated 3BR near Caltrain", price=5100, bedrooms=3, bathrooms=2, sqft=1500, address="345 4th St", neighborhood="SoMa", lat=37.7810, lng=-122.3990, parking=1, laundry=1, spam=3, hours=8),
    dict(source="zillow", title="Spacious 3BR with Bay Views", price=6800, bedrooms=3, bathrooms=2, sqft=1800, address="1200 Potrero Ave", neighborhood="Potrero Hill", lat=37.7530, lng=-122.4070, parking=1, laundry=1, spam=0, hours=12),
    dict(source="craigslist", title="3BR Victorian Flat — Haight", price=5500, bedrooms=3, bathrooms=1, sqft=1400, address="1543 Haight St", neighborhood="Haight-Ashbury", lat=37.7695, lng=-122.4482, parking=0, laundry=0, spam=10, hours=18),
    dict(source="zillow", title="Modern 3BR Condo, In-unit W/D", price=7200, bedrooms=3, bathrooms=2, sqft=1650, address="888 7th St", neighborhood="SoMa", lat=37.7717, lng=-122.3989, parking=1, laundry=1, spam=0, hours=2),
    dict(source="apartments.com", title="3BR in Dogpatch Loft Building", price=5800, bedrooms=3, bathrooms=2, sqft=1700, address="900 Tennessee St", neighborhood="Dogpatch", lat=37.7580, lng=-122.3910, parking=1, laundry=1, spam=8, hours=36),
    dict(source="craigslist", title="Affordable 3BR near BART", price=3800, bedrooms=3, bathrooms=1, sqft=1100, address="501 Balboa Park", neighborhood="Outer Richmond", lat=37.7755, lng=-122.4975, parking=0, laundry=0, spam=15, hours=48),
    dict(source="zillow", title="3BR Townhouse w/ Garage", price=6500, bedrooms=3, bathrooms=2.5, sqft=1900, address="205 Brannan St", neighborhood="SoMa", lat=37.7827, lng=-122.3920, parking=1, laundry=1, spam=2, hours=6),
    dict(source="apartments.com", title="Pet-friendly 3BR, Great Light", price=4900, bedrooms=3, bathrooms=2, sqft=1300, address="3200 24th St", neighborhood="Mission", lat=37.7525, lng=-122.4137, parking=0, laundry=1, spam=5, hours=20),
    dict(source="craigslist", title="Charming 3BR, Hardwood Floors", price=4600, bedrooms=3, bathrooms=1, sqft=1250, address="1120 Guerrero St", neighborhood="Mission", lat=37.7543, lng=-122.4226, parking=0, laundry=0, spam=12, hours=60),
    dict(source="zillow", title="Luxury 3BR, Rooftop Deck", price=8500, bedrooms=3, bathrooms=3, sqft=2100, address="425 1st St", neighborhood="Rincon Hill", lat=37.7870, lng=-122.3920, parking=1, laundry=1, spam=0, hours=1),
    dict(source="craigslist", title="GREAT DEAL 3BR ACT FAST!!!", price=1800, bedrooms=3, bathrooms=2, sqft=1500, address="999 Market St", neighborhood="SoMa", lat=37.7825, lng=-122.4100, parking=1, laundry=1, spam=85, hours=5),
    dict(source="craigslist", title="FREE MONTH 3BR LUXURY APT", price=2000, bedrooms=3, bathrooms=2, sqft=None, address=None, neighborhood=None, lat=None, lng=None, parking=0, laundry=0, spam=92, hours=10),
    dict(source="apartments.com", title="3BR near Glen Park BART", price=5200, bedrooms=3, bathrooms=2, sqft=1450, address="45 Chenery St", neighborhood="Glen Park", lat=37.7340, lng=-122.4335, parking=1, laundry=1, spam=3, hours=72),
    dict(source="zillow", title="3BR with Garden, Noe Valley", price=7000, bedrooms=3, bathrooms=2, sqft=1600, address="1388 Sanchez St", neighborhood="Noe Valley", lat=37.7472, lng=-122.4310, parking=0, laundry=1, spam=0, hours=30),
    dict(source="craigslist", title="3BR Sunset District, Quiet Block", price=3900, bedrooms=3, bathrooms=1, sqft=1200, address="2050 Irving St", neighborhood="Sunset", lat=37.7637, lng=-122.4830, parking=1, laundry=0, spam=8, hours=90),
    dict(source="apartments.com", title="3BR NoPa, Walk to Panhandle", price=5400, bedrooms=3, bathrooms=2, sqft=1380, address="820 McAllister St", neighborhood="NoPa", lat=37.7785, lng=-122.4370, parking=0, laundry=1, spam=6, hours=15),
    dict(source="zillow", title="Top Floor 3BR, City Views", price=6200, bedrooms=3, bathrooms=2, sqft=1550, address="600 King St", neighborhood="SoMa", lat=37.7760, lng=-122.3950, parking=1, laundry=1, spam=0, hours=10),
]

for l in LISTINGS:
    listed = (now - timedelta(hours=l["hours"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    fetched = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        """INSERT OR REPLACE INTO listings
           (id, source, title, url, price, bedrooms, bathrooms, sqft,
            address, neighborhood, lat, lng, has_parking, has_laundry,
            spam_score, spam_flags, body, listed_at, fetched_at, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            str(uuid.uuid4()), l["source"], l["title"], None,
            l["price"], l["bedrooms"], l["bathrooms"], l["sqft"],
            l["address"], l["neighborhood"], l["lat"], l["lng"],
            l["parking"], l["laundry"], l["spam"],
            "[]", None, listed, fetched, 1,
        ),
    )

conn.commit()
conn.close()

print(f"Seeded {len(LISTINGS)} listings into {DB_PATH}")
