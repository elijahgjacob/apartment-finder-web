import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function SearchBar({
  onSearch,
  searching,
  defaultBudget,
}: {
  onSearch: (query: string, budget: number) => void
  searching: boolean
  defaultBudget?: number
}) {
  const [query, setQuery] = useState("")
  const [budget, setBudget] = useState(defaultBudget ?? 7500)

  useEffect(() => {
    if (defaultBudget != null) setBudget(defaultBudget)
  }, [defaultBudget])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    onSearch(query.trim(), budget)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mb-3">
          Search for apartments
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 3BR in Mission under $5000 with parking"
            className="flex-1 font-mono text-sm"
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono">
              Budget
            </span>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              step={250}
              min={1000}
              max={20000}
              className="w-28 text-right font-mono text-sm"
            />
          </div>
          <Button
            type="submit"
            disabled={searching || !query.trim()}
            className="self-end font-mono text-[10px] tracking-[0.12em] uppercase"
          >
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
