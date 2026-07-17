import { ImageResponse } from "next/og"
import { MARK_DATA_URI } from "./og-mark"

export const runtime = "edge"
export const alt = "Bay Area Apartment Finder: AI apartment search with cited sources"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: "#fcfcfa",
          backgroundImage: "linear-gradient(135deg, #fff0e8 0%, #fcfcfa 55%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <img src={MARK_DATA_URI} width={150} height={150} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 500, color: "#1d1b16", letterSpacing: "-2px" }}>
              Apartment Finder
            </div>
            <div style={{ fontSize: 32, color: "#5C5B59", marginTop: 10 }}>
              Find your Bay Area rental in your own words.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 64 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#fb631b" }} />
          <div style={{ fontSize: 26, color: "#858483" }}>
            AI search with cited sources · Powered by Parallel
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: 1200,
            height: 14,
            backgroundColor: "#fb631b",
          }}
        />
      </div>
    ),
    size,
  )
}
