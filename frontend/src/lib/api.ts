// Single place that decides where /api/* requests go.
//
// Local dev: VITE_API_BASE is unset → empty string → relative URL → Vite
//   dev proxy forwards to FastAPI on 127.0.0.1:8000.
// Production: set VITE_API_BASE in Vercel project env to the deployed
//   backend's origin (e.g. https://api.parallel-apt-demo.fly.dev).

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")

export function api(path: string): string {
  return `${API_BASE}${path}`
}
