import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { AppConfig } from "./types"

const ConfigContext = createContext<AppConfig | null>(null)

export function useAppConfig() {
  return useContext(ConfigContext)
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {})
  }, [])

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  )
}
