import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked } from "@/lib/lock";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect("/");

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { score: true, bracketPredictions: true, groupPredictions: true },
  });
  if (!target || target.leagueId !== me.leagueId) notFound();

  const teams = await prisma.team.findMany();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const name = (id?: string | null) => (id && teamById.get(id) ? `${teamById.get(id)!.flag} ${teamById.get(id)!.code}` : "—");

  const b = (target.score?.breakdown as Record<string, number> | undefined) ?? {};
  const reveal = isLocked() || target.id === me.id;

  const champion = target.bracketPredictions.find((p) => p.matchNumber === 104)?.winnerTeamId;
  const finalists = target.bracketPredictions
    .filter((p) => p.matchNumber === 101 || p.matchNumber === 102)
    .map((p) => p.winnerTeamId);
  const groupWinners = [...target.groupPredictions]
    .sort((a, c) => a.groupId.localeCompare(c.groupId))
    .map((g) => ({ groupId: g.groupId, team: g.rank1TeamId }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{target.displayName}</h1>
          <p className="text-sm text-slate-400">
            {target.submitted ? "Lag inlämnat" : "Ej inlämnat"}
            {target.id === me.id && " · det här är du"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400">Totalpoäng</div>
          <div className="text-4xl font-extrabold">{target.score?.total ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gruppmatcher" value={b.groupMatches ?? 0} />
        <Stat label="Vidare ur grupp" value={b.advancement ?? 0} />
        <Stat label="Slutspel" value={b.knockout ?? 0} />
        <Stat label="Världsmästare" value={b.champion ?? 0} />
      </div>

      {reveal ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-3 font-bold">Slutspelstips</h2>
            <p className="text-sm">🏆 Mästare: <strong>{name(champion)}</strong></p>
            <p className="mt-1 text-sm text-slate-300">
              Finalister: {finalists.length ? finalists.map((f) => name(f)).join(" · ") : "—"}
            </p>
          </div>
          <div className="card p-4">
            <h2 className="mb-3 font-bold">Gruppsegrare</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {groupWinners.length ? (
                groupWinners.map((g) => (
                  <div key={g.groupId}>
                    <span className="text-slate-500">{g.groupId}:</span> {name(g.team)}
                  </div>
                ))
              ) : (
                <span className="text-slate-500">Inga tips</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-center text-slate-400">
          🔒 Andra spelares tips visas först när turneringen startat.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
