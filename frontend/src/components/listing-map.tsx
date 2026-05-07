import { useEffect, useRef } from "react"
import L from "leaflet"
import { Card } from "@/components/ui/card"
import type { AppConfig, Listing } from "@/types"

function markerColor(score: number) {
  if (score >= 70) return "#34d399"
  if (score >= 45) return "#fbbf24"
  return "#f87171"
}

function makeDotIcon(color: string, size = 12) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid ${color}44;border-radius:50%;box-shadow:0 0 6px ${color}66;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

type MapProps = {
  listings: Listing[]
  config: AppConfig | null
}

export function ListingMap({ listings, config }: MapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)

  const centerLat = config?.mapCenter.lat ?? 37.7749
  const centerLng = config?.mapCenter.lng ?? -122.4194
  const zoom = config?.mapZoom ?? 13

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([centerLat, centerLng], zoom)

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map)

    if (config?.referencePoint) {
      const refIcon = makeDotIcon("#60a5fa", 10)
      L.marker([config.referencePoint.lat, config.referencePoint.lng], { icon: refIcon })
        .addTo(map)
        .bindPopup(
          `<span style="font-family:monospace;font-size:11px;color:#fafafa;">${config.referencePoint.name}</span>`
        )
    }

    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [centerLat, centerLng, zoom, config])

  useEffect(() => {
    if (!markersRef.current) return
    markersRef.current.clearLayers()

    for (const l of listings) {
      if (l.lat == null || l.lng == null) continue
      const color = markerColor(l.score ?? 0)
      const icon = makeDotIcon(color)
      const price = l.price ? `$${l.price.toLocaleString()}/mo` : "—"
      const name = l.address || l.title || "—"

      L.marker([l.lat, l.lng], { icon })
        .addTo(markersRef.current!)
        .bindPopup(
          `<div style="font-family:monospace;font-size:11px;color:#fafafa;line-height:1.5;">` +
            `<strong>${name}</strong><br>` +
            (l.neighborhood
              ? `<span style="color:#71717a;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;">${l.neighborhood}</span><br>`
              : "") +
            `${price}</div>`,
          { className: "dark-popup" }
        )
    }
  }, [listings])

  return (
    <Card className="overflow-hidden">
      <div ref={containerRef} style={{ height: 420 }} />
    </Card>
  )
}
