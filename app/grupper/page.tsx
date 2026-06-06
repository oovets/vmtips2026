import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeAllStandings, type ResultRef, type TeamRef } from "@/lib/standings";
import type { FormEntry } from "@/lib/football-api";
import { wc2022Badge, WC2022_LEGEND } from "@/lib/wc2022";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKL".split("");

export default async function GrupperPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [teams, finished] = await Promise.all([
    prisma.team.findMany(),
    prisma.match.findMany({
      where: { stage: "GROUP", status: "FINISHED" },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamsByGroup: Record<string, TeamRef[]> = {};
  for (const t of teams)
    (teamsByGroup[t.groupId] ??= []).push({ id: t.id, groupId: t.groupId, fifaRank: t.fifaRank });

  const results: ResultRef[] = finished
    .filter((m) => m.homeTeamId && m.awayTeamId && m.homeScore != null && m.awayScore != null)
    .map((m) => ({
      homeTeamId: m.homeTeamId!,
      awayTeamId: m.awayTeamId!,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    }));

  const standings = computeAllStandings(teamsByGroup, results);
  const anyPlayed = results.length > 0;
  const hasForm = teams.some((t) => (t.recentForm as unknown as FormEntry[]).length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Gruppställningar</h1>
        <p className="text-sm text-slate-400">
          {anyPlayed
            ? "Live från spelade matcher."
            : "Inga matcher spelade än — ställningarna fylls på under turneringen."}
          {!hasForm && (
            <span className="ml-2 text-slate-500">(Lagform kan synkas via Admin → Synka lagform)</span>
          )}
        </p>

        {/* Förklaring av "22"-kolumnens förkortningar (VM 2022-placering) */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">VM 2022</span>
          {WC2022_LEGEND.map((l) => (
            <span key={l.code} className="flex items-center gap-1">
              <span className="font-mono font-semibold text-slate-300">{l.code}</span>
              <span>{l.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {LETTERS.map((letter) => (
          <div key={letter} className="card p-4 space-y-3">
            <h2 className="text-base font-bold tracking-wide text-slate-200">Grupp {letter}</h2>

            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 text-left font-medium w-5">#</th>
                  <th className="py-1 text-left font-medium">Lag</th>
                  <th className="py-1 text-right font-medium" title="Senaste 5 matcherna (W/D/L)">Form</th>
                  <th className="py-1 text-right font-medium w-8 pl-2" title="FIFA-ranking">FIFA</th>
                  <th className="py-1 text-right font-medium w-9" title="Placering VM 2022 (W=vinnare, RU=final, QF=kvartsfinal, R16=åttondel, GS=gruppspel)">22</th>
                  <th className="py-1 text-right font-medium w-6">S</th>
                  <th className="py-1 text-right font-medium w-8">MS</th>
                  <th className="py-1 text-right font-medium w-6">P</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {standings[letter].map((st, i) => {
                  const t = teamById.get(st.teamId)!;
                  const form = (t.recentForm as unknown as FormEntry[]).slice(0, 5);
                  return (
                    <tr key={st.teamId} className={i < 2 ? "text-pitch-100" : "text-slate-400"}>
                      <td className="py-1.5 tabular-nums text-slate-500 text-xs">{i + 1}</td>
                      <td className="py-1.5 whitespace-nowrap">
                        <span>{t.flag} <span className="font-medium">{t.code}</span></span>
                        {i === 2 && <span className="ml-1 text-[10px] text-amber-300/70">(trea)</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <span className="flex justify-end gap-0.5">
                          {form.length > 0
                            ? form.map((f, fi) => (
                                <span
                                  key={fi}
                                  title={`${f.opp} ${f.score} (${f.date})`}
                                  className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold leading-none ${
                                    f.result === "W"
                                      ? "bg-green-500/80 text-white"
                                      : f.result === "D"
                                      ? "bg-slate-500/80 text-white"
                                      : "bg-red-500/70 text-white"
                                  }`}
                                >
                                  {f.result}
                                </span>
                              ))
                            : <span className="text-slate-700 text-xs">—</span>
                          }
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-xs text-slate-500 pl-2">{t.fifaRank}</td>
                      <td className="py-1.5 text-right tabular-nums text-xs text-slate-500">
                        {(() => { const b = wc2022Badge(t.code); return b ? <span title={b.title}>{b.text}</span> : <span className="text-slate-700">—</span>; })()}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-400 text-xs">{st.played}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-400 text-xs">
                        {st.gd > 0 ? "+" : ""}{st.gd}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{st.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
