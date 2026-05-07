import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { useAppConfig } from "@/config-context"
import type { Listing } from "@/types"

function searchUrl(l: Listing, city: string) {
  if (l.url) return l.url
  const q = encodeURIComponent(`${l.address ?? l.title ?? ""} rent ${city}`)
  return `https://www.google.com/search?q=${q}`
}

export function ListingTable({ listings }: { listings: Listing[] }) {
  const config = useAppConfig()
  const city = config?.cityShort ?? ""
  if (listings.length === 0) return null

  return (
    <div>
      <p className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mb-3">
        All results
      </p>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["#", "Address", "Price", "Size", "Phone", "Source", ""].map(
                (h) => (
                  <TableHead
                    key={h}
                    className="text-[10px] tracking-[0.12em] uppercase font-mono font-medium"
                  >
                    {h}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.map((l, i) => {
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium truncate max-w-[260px]">
                      {l.address ?? l.title ?? "—"}
                    </div>
                    {l.neighborhood && (
                      <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground font-mono mt-0.5">
                        {l.neighborhood}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono whitespace-nowrap">
                    {l.price ? `$${l.price.toLocaleString()}/mo` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {l.bedrooms ?? "?"}bd
                    {l.bathrooms != null ? ` · ${l.bathrooms}ba` : ""}
                    {l.sqft != null ? ` · ${l.sqft.toLocaleString()}ft²` : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-emerald-400/80">
                    {l.phone || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {l.source}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      href={searchUrl(l, city)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline whitespace-nowrap"
                    >
                      Search →
                    </a>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
