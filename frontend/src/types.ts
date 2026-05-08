export type ListingDetails = {
  available_date?: string | null
  lease_term?: string | null
  pet_policy?: string | null
  is_furnished?: boolean | null
  utilities_included?: string | null
  amenities?: string | null
  neighborhood_name?: string | null
  parking_type?: string | null
  laundry_type?: string | null
  via_monitor?: boolean | null
  monitor_event_date?: string | null
  monitor_summary?: string | null
  is_currently_active?: boolean | null
  days_on_market?: number | null
}

export type MatchCondition = {
  name: string
  value: string
  matched: boolean
}

export type Citation = {
  title: string
  url: string
}

export type Listing = {
  id: string
  source: string
  title: string | null
  url: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  address: string | null
  neighborhood: string | null
  lat: number | null
  lng: number | null
  has_parking: boolean | null
  has_laundry: boolean | null
  spam_score: number
  body: string | null
  details?: ListingDetails
  phone?: string | null
  reasoning?: string
  score?: number
  listed_at?: string | null
  fetched_at?: string | null
  // Streamed only (not persisted in DB)
  match_basis?: MatchCondition[]
  citations?: Citation[]
}

export type AppConfig = {
  appTitle: string
  city: string
  cityShort: string
  referencePoint: { name: string; lat: number; lng: number }
  mapCenter: { lat: number; lng: number }
  mapZoom: number
  defaultBudget: number
  defaultQuery: string
}

export type TaskEvent =
  | { event: "status"; status: string }
  | { event: "reasoning"; text: string }
  | { event: "listing"; listing: Listing }
  | { event: "error"; message: string }
