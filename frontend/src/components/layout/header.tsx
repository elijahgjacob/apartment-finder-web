"use client"

import { Z, FONT_HEADING } from "@/lib/palette"
import type { AppConfig } from "@/types"

function SparkleIcon({ size = 14, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2 14 9 21 11 14 13 12 20 10 13 3 11 10 9z" />
    </svg>
  )
}

interface HeaderProps {
  config: AppConfig
}

export function Header({ config }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur"
      style={{ backgroundColor: "rgba(255,255,255,0.92)", borderBottom: `1px solid ${Z.border}` }}
    >
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {config.brand.logoUrl ? (
            <img src={config.brand.logoUrl} alt={config.brand.name} className="h-10 w-auto" />
          ) : (
            <span
              className="text-base font-bold tracking-tight"
              style={{ color: Z.text, fontFamily: FONT_HEADING }}
            >
              {config.brand.name}
            </span>
          )}
        </div>
        <a
          href="/docs"
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors hover:brightness-95"
          style={{ color: Z.blueDark, backgroundColor: Z.blueSoft, border: `1px solid ${Z.blueBorder}` }}
        >
          <SparkleIcon size={11} color={Z.blue} />
          How this was built →
        </a>
      </div>
    </header>
  )
}
