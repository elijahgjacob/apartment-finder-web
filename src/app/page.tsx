import { Suspense } from "react";
import {
  DEFAULT_BUDGET,
  getListings,
  relativeTime,
  searchUrl,
  signalLabel,
  type ScoredListing,
} from "@/lib/listings";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  budget?: string;
  showSpam?: string;
}>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const budget = clampBudget(sp.budget);
  const showSpam = sp.showSpam === "1";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <Suspense fallback={<LoadingState />}>
          <ListingsView budget={budget} showSpam={showSpam} />
        </Suspense>
      </main>
    </div>
  );
}

function clampBudget(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_BUDGET;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUDGET;
  return Math.min(Math.max(n, 1000), 20000);
}

function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold tracking-[0.05em] uppercase font-mono">
            SF Apartment Finder
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 tracking-[0.12em] uppercase font-mono">
            3BR · Caltrain 4th &amp; King · Spam-filtered · Live Index
          </p>
        </div>
      </div>
    </header>
  );
}

async function ListingsView({
  budget,
  showSpam,
}: {
  budget: number;
  showSpam: boolean;
}) {
  const listings = await getListings({ budget, showSpam });

  const high = listings.filter((l) => l.score >= 70).length;
  const mid = listings.filter((l) => l.score >= 45 && l.score < 70).length;
  const low = listings.filter((l) => l.score < 45).length;
  const top = listings.slice(0, 10);

  return (
    <>
      <StatsBar
        total={listings.length}
        high={high}
        mid={mid}
        low={low}
        budget={budget}
        showSpam={showSpam}
      />
      <p className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mt-4 mb-3">
        Listings scored by recency, price fit, and distance to Caltrain.
      </p>
      <CardList listings={top} />
      <TableView listings={listings} />
    </>
  );
}

function StatsBar({
  total,
  high,
  mid,
  low,
  budget,
  showSpam,
}: {
  total: number;
  high: number;
  mid: number;
  low: number;
  budget: number;
  showSpam: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mt-2">
      <div>
        <div className="text-3xl font-semibold font-mono leading-none">
          {total}
        </div>
        <div className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mt-1">
          active listings
        </div>
      </div>
      <Pill label="High" value={high} color="text-emerald-400" />
      <Pill label="Mid" value={mid} color="text-amber-400" />
      <Pill label="Low" value={low} color="text-red-400" />
      <FilterForm budget={budget} showSpam={showSpam} />
    </div>
  );
}

function Pill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-semibold font-mono leading-none ${color}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase font-mono mt-1">
        {label}
      </div>
    </div>
  );
}

function FilterForm({
  budget,
  showSpam,
}: {
  budget: number;
  showSpam: boolean;
}) {
  return (
    <form
      action="/"
      method="get"
      className="ml-auto flex items-end gap-3 font-mono text-xs"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase">
          Budget
        </span>
        <input
          type="number"
          name="budget"
          defaultValue={budget}
          step={250}
          min={1000}
          max={20000}
          className="bg-card border border-border rounded px-2 py-1 w-24 text-right"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-1.5">
        <input
          type="checkbox"
          name="showSpam"
          value="1"
          defaultChecked={showSpam}
          className="accent-emerald-500"
        />
        <span className="text-[10px] text-muted-foreground tracking-[0.12em] uppercase">
          Show spam
        </span>
      </label>
      <button
        type="submit"
        className="bg-foreground text-background rounded px-3 py-1.5 text-[10px] tracking-[0.12em] uppercase font-semibold hover:opacity-90"
      >
        Refresh
      </button>
    </form>
  );
}

function CardList({ listings }: { listings: ScoredListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center font-mono">
        No listings match the current filters.
      </div>
    );
  }
  return (
    <ol className="border border-border rounded-lg overflow-hidden bg-card divide-y divide-border">
      {listings.map((l, i) => (
        <li
          key={l.id}
          className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.02]"
        >
          <span className="text-xs font-mono text-muted-foreground w-5 text-right">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            {l.neighborhood && (
              <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground font-mono">
                {l.neighborhood}
              </div>
            )}
            <a
              href={searchUrl(l)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline truncate block"
            >
              {l.address ?? l.title ?? "—"}
            </a>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {l.bedrooms ?? 3}bd
              {l.bathrooms ? ` · ${l.bathrooms}ba` : ""}
              {l.sqft ? ` · ${l.sqft.toLocaleString()} ft²` : ""}
              {" · "}
              {relativeTime(l.listed_at)}
              {" · "}
              {l.source}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-semibold text-sm whitespace-nowrap">
              {l.price ? `$${l.price.toLocaleString()}/mo` : "—"}
            </div>
            <div
              className={`font-mono text-xs mt-0.5 ${scoreColor(l.score)}`}
            >
              {l.score}
              <span className="text-muted-foreground">/100</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TableView({ listings }: { listings: ScoredListing[] }) {
  if (listings.length === 0) return null;
  return (
    <div className="mt-8 border border-border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.02]">
          <tr>
            {[
              "#",
              "Address",
              "Price",
              "Size",
              "Score",
              "Listed",
              "Signal",
              "Source",
              "",
            ].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[10px] tracking-[0.12em] uppercase text-muted-foreground font-mono font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {listings.map((l, i) => (
            <tr key={l.id} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {i + 1}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium truncate max-w-[260px]">
                  {l.address ?? l.title ?? "—"}
                </div>
                {l.neighborhood && (
                  <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground font-mono mt-0.5">
                    {l.neighborhood}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 font-mono whitespace-nowrap">
                {l.price ? `$${l.price.toLocaleString()}/mo` : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                {l.bedrooms ?? 3}bd
                {l.bathrooms ? ` · ${l.bathrooms}ba` : ""}
                {l.sqft ? ` · ${l.sqft.toLocaleString()}ft²` : ""}
              </td>
              <td className={`px-3 py-2 font-mono font-bold ${scoreColor(l.score)}`}>
                {l.score}
              </td>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                {relativeTime(l.listed_at)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <SignalBadge score={l.spam_score} />
              </td>
              <td className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {l.source}
              </td>
              <td className="px-3 py-2 text-right">
                <a
                  href={searchUrl(l)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline whitespace-nowrap"
                >
                  Search →
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalBadge({ score }: { score: number }) {
  const label = signalLabel(score);
  const color =
    label === "Clean"
      ? "text-emerald-400"
      : label === "Review"
        ? "text-amber-400"
        : "text-red-400";
  return <span className={color}>{label}</span>;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-red-400";
}

function LoadingState() {
  return (
    <div className="text-sm text-muted-foreground py-12 text-center font-mono">
      Loading listings…
    </div>
  );
}
