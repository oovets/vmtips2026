import { prisma } from "@/lib/prisma";
import { computeAllStandings, type ResultRef, type TeamRef } from "@/lib/standings";
import type { FormEntry } from "@/lib/football-api";
import { wc2022Badge, WC2022_LEGEND } from "@/lib/wc2022";
import { PageHeading } from "@/components/PageHeading";
import { CountryGroupFilters } from "@/components/CountryGroupFilters";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKL".split("");

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export default async function GrupperPage({
  searchParams,
}: {
  searchParams?: { q?: string | string[] };
}) {
  const query = paramValue(searchParams?.q);
  const q = normalized(query);

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
  const teamMatchesQuery = (teamId: string) => {
    if (!q) return false;
    const team = teamById.get(teamId);
    return !!team && (normalized(team.name).includes(q) || normalized(team.code).includes(q));
  };
  const visibleLetters = LETTERS.filter((letter) => {
    if (!q) return true;
    return normalized(letter).includes(q) || normalized(`grupp ${letter}`).includes(q) || standings[letter]?.some((st) => teamMatchesQuery(st.teamId));
  });

  return (
    <div className="space-y-5">
      <PageHeading
        title="Gruppställningar"
      >
      <div className="space-y-5">
        <CountryGroupFilters basePath="/grupper" query={query} count={visibleLetters.length} />

        {/* Förklaring av "22"-kolumnens förkortningar (VM 2022-placering) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400">VM 2022</span>
          {WC2022_LEGEND.map((l) => (
            <span key={l.code} className="flex items-center gap-1">
              <span className="font-mono font-semibold text-slate-300">{l.code}</span>
              <span>{l.label}</span>
            </span>
          ))}
        </div>

      {visibleLetters.length === 0 ? (
        <p className="card p-4 text-sm text-slate-400">Inga grupper matchar filtret.</p>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        {visibleLetters.map((letter) => (
          <div key={letter} id={`grupp-${letter}`} className="card scroll-mt-24 p-4 space-y-3">
            <h2 className="text-base font-bold tracking-wide text-slate-200">Grupp {letter}</h2>

            <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[300px] text-sm">
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
                  const isMatch = teamMatchesQuery(st.teamId);
                  return (
                    <tr
                      key={st.teamId}
                      className={`${i < 2 ? "text-pitch-100" : "text-slate-400"} ${
                        isMatch ? "bg-pitch-500/10 text-slate-100" : ""
                      }`}
                    >
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
          </div>
        ))}
      </div>
      )}
      </div>
      </PageHeading>
    </div>
  );
}
