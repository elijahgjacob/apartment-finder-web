import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "leaflet/dist/leaflet.css"
import App from "./App"
import Demo from "./Demo"
import { ConfigProvider } from "./config-context"

const isDemo = window.location.pathname.startsWith("/demo")
const Root = isDemo ? Demo : App

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <Root />
    </ConfigProvider>
  </StrictMode>
)
