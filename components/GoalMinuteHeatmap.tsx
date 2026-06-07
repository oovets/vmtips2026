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

  if (total === 0) {
    return <p className="card p-4 text-sm text-slate-400">{emptyHint}</p>;
  }

  return (
    <div className="card p-4">
      {/* Halvleksetiketter ovanför */}
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
        <span>1:a halvlek</span>
        <span>2:a halvlek</span>
        <span>Tillägg</span>
      </div>

      {/* Intensitetsraden */}
      <div className="flex items-end gap-0.5">
        {buckets.map((b) => (
          <div key={b.label} className="group relative flex-1">
            <div
              title={`${b.label} min · ${b.count} mål`}
              className={`h-9 rounded-[3px] ${cellClass(b.count, max)} transition group-hover:ring-1 group-hover:ring-white/30`}
            />
            <div className="mt-1 text-center text-[9px] tabular-nums text-slate-600">{b.count > 0 ? b.count : ""}</div>
          </div>
        ))}
      </div>

      {/* Minutaxel: visa var 15:e minut för att hålla det rent */}
      <div className="mt-0.5 flex gap-0.5 text-[9px] tabular-nums text-slate-500">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 text-center">
            {b.end === 15 || b.end === 30 || b.end === 45 || b.end === 60 || b.end === 75 || b.end === 90
              ? b.end
              : b.label === "90+"
                ? "90+"
                : ""}
          </div>
        ))}
      </div>

      {/* Sammanfattning + skala */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-slate-400">
        <span>
          {total} mål med känd minut
          {peak && (
            <span className="ml-2 text-slate-300">
              · flest i <span className="font-semibold">{peak.label} min</span> ({peak.count})
            </span>
          )}
          <span className="ml-2 text-slate-600">{matchesWithMinuteData} matcher</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-slate-600">Färre</span>
          <span className="h-3 w-3 rounded-[2px] bg-amber-500/20" />
          <span className="h-3 w-3 rounded-[2px] bg-amber-500/40" />
          <span className="h-3 w-3 rounded-[2px] bg-orange-500/55" />
          <span className="h-3 w-3 rounded-[2px] bg-orange-500/75" />
          <span className="h-3 w-3 rounded-[2px] bg-red-500/90" />
          <span className="text-slate-600">Fler</span>
        </span>
      </div>
    </div>
  );
}
