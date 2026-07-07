import { useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

export function ReasoningPanel({
  reasoning,
  searching,
  done,
  foundCount,
  error,
}: {
  reasoning: string
  searching: boolean
  done: boolean
  foundCount: number
  error: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [reasoning])

  const label = error ? "Error" : done ? "Done" : "Searching…"

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        {searching && (
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono">
          {label}
        </span>
        {foundCount > 0 && (
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            {foundCount} found
          </Badge>
        )}
      </div>
      <ScrollArea className="max-h-64">
        <div
          ref={scrollRef}
          className="px-4 py-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono max-h-64 overflow-y-auto"
        >
          {reasoning || (searching ? "Thinking…" : "")}
          {error && <span className="text-destructive block mt-2">{error}</span>}
        </div>
      </ScrollArea>
    </Card>
  )
}
