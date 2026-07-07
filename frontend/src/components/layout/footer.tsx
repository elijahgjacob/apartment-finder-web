"use client"

import { Z } from "@/lib/palette"

interface FooterProps {
  disclaimer: string
}

export function Footer({ disclaimer }: FooterProps) {
  return (
    <footer className="max-w-6xl mx-auto px-6 py-10">
      <div className="text-xs" style={{ color: Z.textFaint }}>
        {disclaimer}
      </div>
    </footer>
  )
}
