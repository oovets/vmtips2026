import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeAllStandings, type ResultRef, type TeamRef } from "@/lib/standings";

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Gruppställningar</h1>
        <p className="text-sm text-slate-400">
          {anyPlayed ? "Live från spelade matcher." : "Inga matcher spelade än — ställningarna fylls på under turneringen."}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {LETTERS.map((letter) => (
          <div key={letter} className="card p-4">
            <h2 className="mb-2 text-lg font-bold">Grupp {letter}</h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 text-left font-medium">#</th>
                  <th className="py-1 text-left font-medium">Lag</th>
                  <th className="py-1 text-right font-medium">S</th>
                  <th className="py-1 text-right font-medium">MS</th>
                  <th className="py-1 text-right font-medium">P</th>
                </tr>
              </thead>
              <tbody>
                {standings[letter].map((st, i) => {
                  const t = teamById.get(st.teamId)!;
                  return (
                    <tr key={st.teamId} className={i < 2 ? "text-pitch-200" : "text-slate-300"}>
                      <td className="py-1 tabular-nums">{i + 1}</td>
                      <td className="py-1">
                        {t.flag} {t.code}
                        {i === 2 && <span className="text-[10px] text-amber-300/70"> (trea)</span>}
                      </td>
                      <td className="py-1 text-right tabular-nums text-slate-400">{st.played}</td>
                      <td className="py-1 text-right tabular-nums text-slate-400">
                        {st.gd > 0 ? "+" : ""}
                        {st.gd}
                      </td>
                      <td className="py-1 text-right font-semibold tabular-nums">{st.points}</td>
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
