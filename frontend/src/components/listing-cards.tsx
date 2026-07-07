import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAppConfig } from "@/config-context"
import type { Listing } from "@/types"

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400"
  if (score >= 45) return "text-amber-400"
  return "text-red-400"
}

function searchUrl(l: Listing, city: string) {
  if (l.url) return l.url
  const q = encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)
  return `https://www.google.com/search?q=${q}`
}

export function ListingCards({ listings }: { listings: Listing[] }) {
  const config = useAppConfig()
  const city = config?.cityShort ?? ""
  if (listings.length === 0) return null

  return (
    <div>
      <p className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mb-3">
        Top results
      </p>
      <Card className="divide-y divide-border">
        {listings.map((l, i) => (
          <div
            key={l.id}
            className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              {l.neighborhood && (
                <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground font-mono">
                  {l.neighborhood}
                </div>
              )}
              <a
                href={searchUrl(l, city)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline truncate block"
              >
                {l.address ?? l.title ?? "—"}
              </a>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 flex flex-wrap gap-x-1">
                <span>{l.bedrooms ?? "?"}bd</span>
                {l.bathrooms != null && (
                  <>
                    <Separator orientation="vertical" className="h-3 mx-0.5" />
                    <span>{l.bathrooms}ba</span>
                  </>
                )}
                {l.sqft != null && (
                  <>
                    <Separator orientation="vertical" className="h-3 mx-0.5" />
                    <span>{l.sqft.toLocaleString()} ft²</span>
                  </>
                )}
                <Separator orientation="vertical" className="h-3 mx-0.5" />
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                  {l.source}
                </Badge>
              </div>
              {(l.details?.available_date || l.details?.pet_policy || l.details?.lease_term) && (
                <div className="text-[10px] text-muted-foreground font-mono mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  {l.details?.available_date && (
                    <span>📅 {l.details.available_date}</span>
                  )}
                  {l.details?.lease_term && (
                    <span>📜 {l.details.lease_term}</span>
                  )}
                  {l.details?.pet_policy && (
                    <span>🐾 {l.details.pet_policy}</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono font-semibold text-sm whitespace-nowrap">
                {l.price ? `$${l.price.toLocaleString()}/mo` : "—"}
              </div>
              {l.score != null && (
                <div className={`font-mono text-xs mt-0.5 ${scoreColor(l.score)}`}>
                  {l.score}
                  <span className="text-muted-foreground">/100</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
