"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { PlayerDetail } from "./PlayerDetail";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TeamTag {
  code: string;
  flag: string;
}

interface Row {
  id: string;
  displayName: string;
  submitted: boolean;
  total: number;
  rank: number;
  isMe: boolean;
  champion: TeamTag | null;
  finalists: TeamTag[];
  breakdown: Record<string, number> | null;
}

function n(b: Record<string, number> | null, key: string): number {
  return b?.[key] ?? 0;
}

export function Leaderboard() {
  // Poängen räknas om när en match avslutas — polla tätare medan matcher pågår
  // (fångar slutsignalen snabbt) och glesare när inget är live.
  const { data, isLoading } = useSWR<{ rows: Row[]; liveCount?: number }>("/api/leaderboard", fetcher, {
    refreshInterval: (latest) => ((latest?.liveCount ?? 0) > 0 ? 15000 : 45000),
  });
  // Flera spelare kan vara öppna samtidigt.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) return <div className="card p-6 text-slate-400">Laddar…</div>;
  const rows = data?.rows ?? [];
  if (!rows.length) return <div className="card p-6 text-slate-400">Inga spelare än.</div>;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-2 py-3 font-medium">Spelare</th>
            <th className="px-2 py-3 font-medium">Mästare</th>
            <th className="hidden px-2 py-3 font-medium md:table-cell">Finalister</th>
            <th className="px-2 py-3 text-right font-medium" title="Poäng från gruppmatcher">Grupp</th>
            <th className="hidden px-2 py-3 text-right font-medium sm:table-cell" title="Poäng för lag vidare ur grupp">Vidare</th>
            <th className="px-2 py-3 text-right font-medium" title="Poäng från slutspel + världsmästare">Slutspel</th>
            <th className="hidden px-2 py-3 text-right font-medium sm:table-cell" title="Antal exakta resultat">Exakta</th>
            <th className="px-4 py-3 text-right font-medium">Poäng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = r.breakdown;
            const isOpen = open.has(r.id);
            return (
              <Fragment key={r.id}>
                <tr
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/[0.03] ${r.isMe ? "bg-pitch-500/10" : ""} ${isOpen ? "bg-white/[0.04]" : ""}`}
                  onClick={() => toggle(r.id)}
                >
                  <td className="px-4 py-3 font-semibold tabular-nums text-slate-400">{r.rank}</td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggle(r.id); }}
                      className="inline-flex items-center gap-1.5 font-medium hover:underline"
                      aria-expanded={isOpen}
                    >
                      <span className={`text-[10px] text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      {r.displayName}
                    </button>
                    {r.isMe && <span className="ml-1 text-xs text-pitch-300">(du)</span>}
                    {!r.submitted && (
                      <span className="ml-2 text-xs text-amber-300/80">ej inlämnat</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-slate-200">
                    {r.champion ? `${r.champion.flag} ${r.champion.code}` : <span className="text-slate-600">–</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-3 text-slate-300 md:table-cell">
                    {r.finalists.length
                      ? r.finalists.map((f) => `${f.flag} ${f.code}`).join(" · ")
                      : <span className="text-slate-600">–</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-400">{n(b, "groupMatches")}</td>
                  <td className="hidden px-2 py-3 text-right tabular-nums text-slate-400 sm:table-cell">{n(b, "advancement")}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-400">{n(b, "knockout") + n(b, "champion")}</td>
                  <td className="hidden px-2 py-3 text-right tabular-nums text-slate-400 sm:table-cell">{n(b, "exactCount")}</td>
                  <td className="px-4 py-3 text-right text-base font-extrabold tabular-nums">{r.total}</td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-white/5 bg-night-950/40">
                    <td colSpan={9} className="p-0">
                      {/* Detaljpanelen ligger i en min-w-[640px]-tabell. Sticky + en
                          viewport-bunden bredd håller innehållet kvar i synfältet och
                          låter dess egna grids kollapsa på mobilen istället för att
                          tvingas ut i 640px-bredd. */}
                      <div className="sticky left-0 w-screen max-w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-none">
                        <PlayerDetail id={r.id} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


