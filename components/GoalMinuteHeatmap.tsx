// Målminut-heatmap: en horisontell intensitetsrad över matchminuter i
// 5-minutersintervall. Varmare/mörkare cell = fler mål i det tidsspannet.
// Rent presentationslager — all aggregering sker i lib/goal-minutes.ts.

import type { GoalMinuteSummary } from "@/lib/goal-minutes";

// Färgskala från svalt (få mål) till hett (många). Literala klassnamn så
// Tailwind-JIT plockar upp dem. ratio 0..1 av bucketens andel av max.
function cellClass(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-white/[0.03]";
  const r = count / max;
  if (r <= 0.2) return "bg-amber-500/20";
  if (r <= 0.4) return "bg-amber-500/40";
  if (r <= 0.6) return "bg-orange-500/55";
  if (r <= 0.8) return "bg-orange-500/75";
  return "bg-red-500/90";
}

export function GoalMinuteHeatmap({
  summary,
  emptyHint = "Inga målminuter inrapporterade än.",
}: {
  summary: GoalMinuteSummary;
  emptyHint?: string;
}) {
  const { buckets, total, max, peak, matchesWithMinuteData } = summary;
  const bucketGridStyle = { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` };

  if (total === 0) {
    return <p className="card p-3 text-sm text-slate-400 sm:p-4">{emptyHint}</p>;
  }

  return (
    <div className="card max-w-full overflow-hidden p-2.5 sm:p-4">
      {/* Halvleksetiketter ovanför */}
      <div className="mb-1 grid grid-cols-3 text-[9px] uppercase leading-none tracking-wide text-slate-500 sm:text-[10px]">
        <span>1:a halvlek</span>
        <span className="text-center">2:a halvlek</span>
        <span className="text-right">Tillägg</span>
      </div>

      {/* Intensitetsraden */}
      <div className="grid items-end gap-px sm:gap-0.5" style={bucketGridStyle}>
        {buckets.map((b) => (
          <div key={b.label} className="group relative min-w-0">
            <div
              title={`${b.label} min · ${b.count} mål`}
              className={`h-6 rounded-[2px] sm:h-9 sm:rounded-[3px] ${cellClass(b.count, max)} transition group-hover:ring-1 group-hover:ring-white/30`}
            />
            <div className="mt-0.5 min-h-2 text-center text-[8px] leading-none tabular-nums text-slate-600 sm:mt-1 sm:text-[9px]">
              {b.count > 0 ? b.count : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Minutaxel: glesare på mobil, var 15:e minut från sm och uppåt. */}
      <div className="mt-0.5 grid gap-px text-[8px] leading-none tabular-nums text-slate-500 sm:gap-0.5 sm:text-[9px]" style={bucketGridStyle}>
        {buckets.map((b) => {
          const mobileTick = b.end === 30 || b.end === 60 || b.end === 90 || b.label === "90+";
          const desktopOnlyTick = b.end === 15 || b.end === 45 || b.end === 75;

          return (
            <div key={b.label} className="min-w-0 text-center">
              {mobileTick ? (b.label === "90+" ? "90+" : b.end) : ""}
              <span className="hidden sm:inline">{desktopOnlyTick ? b.end : ""}</span>
            </div>
          );
        })}
      </div>

      {/* Sammanfattning + skala */}
      <div className="mt-2 flex min-w-0 flex-col gap-1 text-[9px] leading-tight text-slate-400 sm:mt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1 sm:text-[10px]">
        <span className="min-w-0">
          {total} mål med känd minut
          {peak && (
            <span className="block text-slate-300 sm:ml-2 sm:inline">
              · flest i <span className="font-semibold">{peak.label} min</span> ({peak.count})
            </span>
          )}
          <span className="block text-slate-600 sm:ml-2 sm:inline">{matchesWithMinuteData} matcher</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <span className="text-slate-600">Färre</span>
          <span className="h-2 w-2 rounded-[2px] bg-amber-500/20 sm:h-3 sm:w-3" />
          <span className="h-2 w-2 rounded-[2px] bg-amber-500/40 sm:h-3 sm:w-3" />
          <span className="h-2 w-2 rounded-[2px] bg-orange-500/55 sm:h-3 sm:w-3" />
          <span className="h-2 w-2 rounded-[2px] bg-orange-500/75 sm:h-3 sm:w-3" />
          <span className="h-2 w-2 rounded-[2px] bg-red-500/90 sm:h-3 sm:w-3" />
          <span className="text-slate-600">Fler</span>
        </span>
      </div>
    </div>
  );
}
