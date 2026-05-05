import { pool } from "./db";

export const SEARCH_LAT = 37.7764;
export const SEARCH_LNG = -122.3973;
export const DEFAULT_BUDGET = 7500;
export const SPAM_HIDE_THRESHOLD = 50;

export type Listing = {
  id: string;
  source: string;
  title: string | null;
  url: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  has_parking: boolean | null;
  has_laundry: boolean | null;
  spam_score: number;
  spam_flags: string[];
  body: string | null;
  listed_at: Date;
  fetched_at: Date;
};

export type ScoredListing = Listing & { score: number };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeScore(l: Listing, budget: number): number {
  let score = 0;

  const ageHours =
    (Date.now() - new Date(l.listed_at).getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) score += 35;
  else if (ageHours < 72) score += 25;
  else if (ageHours < 168) score += 15;
  else score += 5;

  if (l.price) {
    const ratio = l.price / budget;
    if (ratio <= 0.7) score += 40;
    else if (ratio <= 0.8) score += 32;
    else if (ratio <= 0.9) score += 22;
    else if (ratio <= 1.0) score += 12;
  }

  if (l.lat != null && l.lng != null) {
    const km = haversineKm(l.lat, l.lng, SEARCH_LAT, SEARCH_LNG);
    if (km < 1.0) score += 25;
    else if (km < 2.0) score += 18;
    else if (km < 3.5) score += 10;
    else score += 3;
  }

  return Math.min(score, 100);
}

export async function getListings(opts: {
  budget: number;
  showSpam: boolean;
}): Promise<ScoredListing[]> {
  const { rows } = await pool.query<Listing>(
    `SELECT id, source, title, url, price, bedrooms, bathrooms, sqft,
            address, neighborhood, lat, lng, has_parking, has_laundry,
            spam_score,
            COALESCE(spam_flags, '[]'::jsonb) AS spam_flags,
            body, listed_at, fetched_at
       FROM listings
      WHERE is_active = TRUE
        AND ($1::int IS NULL OR price IS NULL OR price <= $1)
        AND ($2::boolean OR spam_score <= $3)
      ORDER BY listed_at DESC`,
    [opts.budget, opts.showSpam, SPAM_HIDE_THRESHOLD]
  );

  return rows
    .map((l) => ({ ...l, score: computeScore(l, opts.budget) }))
    .sort((a, b) => b.score - a.score);
}

export function relativeTime(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function signalLabel(score: number): "Clean" | "Review" | "Spam" {
  if (score <= 20) return "Clean";
  if (score <= 50) return "Review";
  return "Spam";
}

export function searchUrl(l: Listing): string {
  if (l.url) return l.url;
  const q = encodeURIComponent(`${l.address ?? l.title ?? ""} rent San Francisco`);
  return `https://www.google.com/search?q=${q}`;
}
