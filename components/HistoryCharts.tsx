// Historiska mästerskapsgrafer — rena presentationskomponenter (server-renderade,
// inga klientberoenden). Data kommer från lib/tournament-history.ts.

import type {
  MinuteBuckets,
  GoalsPerMatchDist,
  TournamentStat,
  TournamentScorers,
} from "@/lib/tournament-history";

// Färg per mästerskap. Index följer seriens ordning (2022, 2018, 2014, 2010, 2006).
// Femte färgen gör att VM 2006 inte återanvänder samma blå som VM 2022.
const SERIES_COLORS = ["bg-pitch-500", "bg-flag-500", "bg-amber-500", "bg-violet-500", "bg-green-500"];
const SERIES_DOT = ["bg-pitch-500", "bg-flag-500", "bg-amber-500", "bg-violet-500", "bg-green-500"];

function Legend({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
      {names.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${SERIES_DOT[i % SERIES_DOT.length]}`} />
          {n}
        </span>
      ))}
    </div>
  );
}

// Grupperad stapelgraf: en grupp per kategori (x), en stapel per mästerskap.
export function GroupedBarChart({
  labels,
  series,
  unit = "mål",
}: {
  labels: string[];
  series: { tournament: string; counts: number[] }[];
  unit?: string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.counts));
  return (
    <div className="card p-4">
      <div className="mb-3">
        <Legend names={series.map((s) => s.tournament)} />
      </div>
      <div className="flex items-end gap-2" style={{ height: 160 }}>
        {labels.map((label, ci) => (
          <div key={label} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5">
              {series.map((s, si) => {
                const v = s.counts[ci] ?? 0;
                const h = (v / max) * 100;
                return (
                  <div
                    key={s.tournament}
                    title={`${s.tournament} · ${label}: ${v} ${unit}`}
                    className={`w-full max-w-[14px] rounded-t-sm ${SERIES_COLORS[si % SERIES_COLORS.length]} transition hover:opacity-80`}
                    style={{ height: `${Math.max(v > 0 ? 3 : 0, h)}%` }}
                  />
                );
              })}
            </div>
            <div className="mt-1 text-center text-[9px] tabular-nums text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Jämförelse-rad: en metrik, en horisontell stapel per mästerskap så man ser
// skillnaden direkt. Värdet visas till höger; valfri formatterare.
export function ComparisonBars({
  title,
  stats,
  value,
  format,
  hint,
}: {
  title: string;
  stats: TournamentStat[];
  value: (s: TournamentStat) => number;
  format?: (n: number) => string;
  hint?: string;
}) {
  const max = Math.max(1, ...stats.map(value));
  const fmt = format ?? ((n: number) => String(n));
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      <div className="space-y-2">
        {stats.map((s, i) => {
          const v = value(s);
          return (
            <div key={s.tournament} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 truncate text-slate-400">{s.tournament}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${SERIES_COLORS[i % SERIES_COLORS.length]}`}
                  style={{ width: `${Math.max(v > 0 ? 4 : 0, (v / max) * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-slate-200">{fmt(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Skyttekungar genom åren: ett kort per turnering med dess topp-målskyttar.
export function TopScorersGrid({ data }: { data: TournamentScorers[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((t) => {
        const max = Math.max(1, ...t.scorers.map((s) => s.goals));
        return (
          <div key={t.tournament} className="card p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-200">{t.tournament}</h3>
              {t.scorers[0] && (
                <span className="text-[10px] text-slate-500">
                  skyttekung: {t.scorers[0].player}
                </span>
              )}
            </div>
            {t.scorers.length === 0 ? (
              <p className="text-xs text-slate-500">Ingen måldata.</p>
            ) : (
              <div className="space-y-1">
                {t.scorers.map((s, i) => (
                  <div key={s.player} className="flex items-center gap-2 text-xs">
                    <span className="w-4 shrink-0 tabular-nums text-slate-600">{i + 1}.</span>
                    <span className="w-24 shrink-0 truncate text-slate-300" title={s.player}>{s.player}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${(s.goals / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-slate-200">{s.goals}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Stacked bar är overkill här; vi exporterar de två ovan + en typ-alias för
// tydlighet i anropssidan.
export type { MinuteBuckets, GoalsPerMatchDist };
