// Hard-coded neighborhood lists for the cities the demo is most often run
// against. Used purely client-side to parse neighborhood mentions out of the
// free-text query so they can be chipped in the "Parsed" row and emphasized
// in the FindAll objective.

const NEIGHBORHOODS: Record<string, string[]> = {
  "san francisco": [
    "Mission", "SoMa", "South Beach", "Mission Bay", "Dogpatch", "Potrero Hill",
    "Noe Valley", "Castro", "Hayes Valley", "NoPa", "Lower Haight", "Haight-Ashbury",
    "Duboce Triangle", "Bernal Heights", "Glen Park", "Sunset", "Inner Sunset",
    "Outer Sunset", "Richmond", "Inner Richmond", "Outer Richmond", "Marina",
    "Cow Hollow", "Pacific Heights", "Nob Hill", "Russian Hill", "North Beach",
    "Telegraph Hill", "Financial District", "Tenderloin", "Chinatown",
    "Western Addition", "Fillmore", "Japantown", "Excelsior", "Bayview",
  ],
  "new york": [
    "Williamsburg", "Bushwick", "Greenpoint", "Park Slope", "Bed-Stuy",
    "Crown Heights", "Fort Greene", "Dumbo", "Brooklyn Heights", "Astoria",
    "Long Island City", "Sunnyside", "East Village", "West Village",
    "Lower East Side", "Upper East Side", "Upper West Side", "Chelsea",
    "Hell's Kitchen", "Midtown", "Harlem", "Washington Heights", "Tribeca",
    "SoHo", "Financial District", "Gramercy", "Murray Hill", "Chinatown",
  ],
  "austin": [
    "Downtown", "South Congress", "SoCo", "East Austin", "Hyde Park", "Mueller",
    "Zilker", "Barton Hills", "Bouldin Creek", "Clarksville", "Tarrytown",
    "North Loop", "Crestview", "Domain", "Riverside", "Cherrywood", "Rosedale",
  ],
  "los angeles": [
    "Silver Lake", "Echo Park", "Los Feliz", "Koreatown", "Downtown",
    "Santa Monica", "Venice", "Culver City", "West Hollywood", "Hollywood",
    "Highland Park", "Eagle Rock", "Mid-Wilshire", "Westwood", "Brentwood",
    "Sawtelle", "Mar Vista", "Palms", "Atwater Village",
  ],
  "seattle": [
    "Capitol Hill", "Ballard", "Fremont", "Wallingford", "Queen Anne",
    "Belltown", "South Lake Union", "University District", "Greenwood",
    "Green Lake", "Beacon Hill", "Columbia City", "West Seattle", "Ravenna",
  ],
  "chicago": [
    "Wicker Park", "Logan Square", "Lincoln Park", "Lakeview", "Bucktown",
    "West Loop", "River North", "Old Town", "Pilsen", "Hyde Park", "Uptown",
    "Andersonville", "Ukrainian Village", "Gold Coast", "South Loop",
  ],
  "boston": [
    "Back Bay", "Beacon Hill", "South End", "North End", "Fenway", "Allston",
    "Brighton", "Jamaica Plain", "Somerville", "Cambridge", "Charlestown",
    "Dorchester", "South Boston", "Seaport",
  ],
  "denver": [
    "LoDo", "RiNo", "Capitol Hill", "Highlands", "Cherry Creek", "Wash Park",
    "Five Points", "Baker", "City Park", "Sloan's Lake", "Uptown",
  ],
  "washington": [
    "Dupont Circle", "Adams Morgan", "Logan Circle", "Shaw", "U Street",
    "Capitol Hill", "Navy Yard", "Columbia Heights", "Georgetown", "Petworth",
    "NoMa", "H Street", "Foggy Bottom",
  ],
  "miami": [
    "Brickell", "Wynwood", "Edgewater", "Little Havana", "Coconut Grove",
    "Coral Gables", "Midtown", "Design District", "South Beach", "Downtown",
  ],
}

const CITY_ALIASES: Record<string, string> = {
  sf: "san francisco",
  nyc: "new york",
  "new york city": "new york",
  manhattan: "new york",
  brooklyn: "new york",
  la: "los angeles",
  dc: "washington",
  "washington dc": "washington",
  "washington, dc": "washington",
}

export function neighborhoodsForCity(city: string): string[] {
  const key = city.toLowerCase().split(",")[0].trim()
  const canonical = CITY_ALIASES[key] ?? key
  return NEIGHBORHOODS[canonical] ?? []
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Returns the known neighborhoods mentioned in the query, in query order,
// deduped (e.g. a "South Congress" match swallows the "SoCo" alias).
export function extractNeighborhoodsFromQuery(query: string, city: string): string[] {
  const list = neighborhoodsForCity(city)
  if (!list.length || !query.trim()) return []
  const hits: { name: string; index: number }[] = []
  for (const n of list) {
    const re = new RegExp(`(?<![\\w-])${escapeRegExp(n)}(?![\\w-])`, "i")
    const m = query.match(re)
    if (m && m.index != null) hits.push({ name: n, index: m.index })
  }
  hits.sort((a, b) => a.index - b.index)
  const seen = new Set<string>()
  return hits.filter((h) => {
    const k = h.name.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).map((h) => h.name)
}
