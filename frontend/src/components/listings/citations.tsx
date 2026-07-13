"use client"

import { Z } from "@/lib/palette"
import { safeUrl } from "@/lib/utils"
import { isIndividualListingUrl } from "@/lib/listing-url"
import type { Listing } from "@/types"

export function Citations({ listing }: { listing: Listing }) {
  // Only cite pages we can link to directly — skip bare domains and
  // search/category pages so a source click always lands on a real listing.
  const cites = listing.citations?.filter((c) => isIndividualListingUrl(c.url)) ?? []
  if (!cites.length) return null
  return (
    <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderColor: Z.borderSoft }}>
      <span className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: Z.textFaint }}>
        Sources
      </span>
      {cites.map((c, i) => {
        let host = c.url
        try { host = new URL(c.url).hostname.replace(/^www\./, "") } catch { /* keep */ }
        return (
          <a
            key={c.url}
            href={safeUrl(c.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] hover:underline truncate max-w-[260px] inline-flex items-center gap-1"
            style={{ color: Z.blueDark, fontWeight: 500 }}
            title={c.title}
          >
            <span className="text-[9px] px-1 rounded" style={{ backgroundColor: Z.blueSoft, color: Z.blueDarker, fontWeight: 700 }}>
              {i + 1}
            </span>
            {host}
          </a>
        )
      })}
    </div>
  )
}
