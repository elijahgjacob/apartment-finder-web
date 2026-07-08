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
  search_city?: string | null
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
  brand: {
    name: string
    tagline: string
    logoUrl: string
    disclaimer: string
  }
  suggestions: string[]
  rentFloors: Record<string, number>
  staleness: {
    aggregatorSources: string[]
    aggregatorDays: number
    directDays: number
  }
}

export type TaskEvent =
  | { event: "status"; status: string }
  | { event: "reasoning"; text: string }
  | { event: "listing"; listing: Listing }
  | { event: "error"; message: string }

export type MonitorStatus = {
  active: boolean
  monitor_id?: string | null
  query?: string
  frequency?: string
  processor?: string
  status?: string
  last_run_at?: string
  created_at?: string
  events_last_24h?: number
}

export type StepStatus = "pending" | "active" | "done" | "error"

export type ProcessStep = {
  id: string
  title: string
  subtitle?: string
  detail?: string
  status: StepStatus
  progress?: { matched: number; total: number }
}

export type ViewMode = "list" | "map"
