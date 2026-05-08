import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "leaflet/dist/leaflet.css"
import Demo from "./Demo"
import Docs from "./Docs"
import { ConfigProvider } from "./config-context"

// Lightweight pathname-based routing — /docs renders the docs page;
// every other path falls through to Demo. Avoids pulling in a router.
const path = window.location.pathname
const Root = path.startsWith("/docs") ? Docs : Demo

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <Root />
    </ConfigProvider>
  </StrictMode>
)
