import type { Listing } from "@/types"

export function StatsBar({ listings }: { listings: Listing[] }) {
  const total = listings.length
  const high = listings.filter((l) => (l.score ?? 0) >= 70).length
  const mid = listings.filter((l) => {
    const s = l.score ?? 0
    return s >= 45 && s < 70
  }).length
  const low = listings.filter((l) => (l.score ?? 0) < 45).length

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <StatPill label="Active listings" value={total} />
      <StatPill label="High" value={high} className="text-emerald-400" />
      <StatPill label="Mid" value={mid} className="text-amber-400" />
      <StatPill label="Low" value={low} className="text-red-400" />
    </div>
  )
}

function StatPill({
  label,
  value,
  className = "",
}: {
  label: string
  value: number
  className?: string
}) {
  const isMain = label === "Active listings"
  return (
    <div>
      <div
        className={`font-semibold font-mono leading-none ${className} ${isMain ? "text-3xl" : "text-2xl"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mt-1">
        {label}
      </div>
    </div>
  )
}
