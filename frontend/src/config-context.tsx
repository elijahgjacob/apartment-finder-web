import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { AppConfig } from "./types"

type ConfigState = {
  config: AppConfig | null
  loading: boolean
  error: string | null
}

const ConfigContext = createContext<ConfigState>({ config: null, loading: true, error: null })

export function useAppConfig() {
  return useContext(ConfigContext).config
}

export function useConfigState() {
  return useContext(ConfigContext)
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfigState>({ config: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch("/api/config")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as AppConfig
      })
      .then((config) => {
        if (!cancelled) setState({ config, loading: false, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ config: null, loading: false, error: String(e?.message ?? e) })
      })
    return () => { cancelled = true }
  }, [])

  return (
    <ConfigContext.Provider value={state}>
      {children}
    </ConfigContext.Provider>
  )
}
