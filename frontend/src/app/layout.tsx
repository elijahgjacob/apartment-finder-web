import type { Metadata } from "next"
import "./globals.css"
import "leaflet/dist/leaflet.css"
import { ConfigProvider } from "@/providers/config-provider"

export const metadata: Metadata = {
  title: "Apartment Finder — AI Search",
  description: "Find your home in your own words. AI-powered apartment search with cited sources.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ConfigProvider>
          {children}
        </ConfigProvider>
      </body>
    </html>
  )
}
