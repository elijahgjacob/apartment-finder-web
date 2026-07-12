import type { Metadata } from "next"
import "./globals.css"
import "leaflet/dist/leaflet.css"
import { ConfigProvider } from "@/providers/config-provider"

const TITLE = "Apartment Finder — AI Search"
const DESCRIPTION = "Find your home in your own words. AI-powered apartment search with cited sources."

export const metadata: Metadata = {
  metadataBase: new URL("https://apartment-finder-web.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Apartment Finder",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
