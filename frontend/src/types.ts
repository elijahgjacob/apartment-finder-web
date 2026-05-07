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
  phone?: string | null
  reasoning?: string
  score?: number
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
