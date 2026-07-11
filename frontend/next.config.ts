import type { NextConfig } from "next"

// Where the frontend proxies /api/* to. Defaults to the local backend for
// dev; set BACKEND_ORIGIN in production (e.g. your Fly/Render backend URL).
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
