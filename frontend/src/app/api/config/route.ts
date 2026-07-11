import { NextResponse } from "next/server"
import {
  APP_TITLE, CITY, CITY_SHORT,
  DEFAULT_BUDGET, DEFAULT_QUERY,
  REFERENCE_POINT_NAME, REFERENCE_POINT_LAT, REFERENCE_POINT_LNG,
  MAP_CENTER_LAT, MAP_CENTER_LNG, MAP_ZOOM,
  BRAND_NAME, BRAND_TAGLINE, BRAND_LOGO_URL, BRAND_DISCLAIMER,
  SUGGESTIONS, RENT_FLOORS,
  AGGREGATOR_SOURCES, STALE_AGGREGATOR_DAYS, STALE_DIRECT_DAYS,
} from "@/lib/server/config"

export async function GET() {
  return NextResponse.json({
    appTitle: APP_TITLE,
    city: CITY,
    cityShort: CITY_SHORT,
    referencePoint: {
      name: REFERENCE_POINT_NAME,
      lat: REFERENCE_POINT_LAT,
      lng: REFERENCE_POINT_LNG,
    },
    mapCenter: { lat: MAP_CENTER_LAT, lng: MAP_CENTER_LNG },
    mapZoom: MAP_ZOOM,
    defaultBudget: DEFAULT_BUDGET,
    defaultQuery: DEFAULT_QUERY,
    brand: {
      name: BRAND_NAME,
      tagline: BRAND_TAGLINE,
      logoUrl: BRAND_LOGO_URL,
      disclaimer: BRAND_DISCLAIMER,
    },
    suggestions: SUGGESTIONS,
    rentFloors: RENT_FLOORS,
    staleness: {
      aggregatorSources: AGGREGATOR_SOURCES,
      aggregatorDays: STALE_AGGREGATOR_DAYS,
      directDays: STALE_DIRECT_DAYS,
    },
  })
}
