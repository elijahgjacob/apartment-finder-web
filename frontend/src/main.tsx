import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "leaflet/dist/leaflet.css"
import Demo from "./Demo"
import { ConfigProvider } from "./config-context"

// Both / and /demo render the Zillow-themed Demo for now. The previous
// App.tsx (dark theme) is kept in the repo but not routed.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <Demo />
    </ConfigProvider>
  </StrictMode>
)
