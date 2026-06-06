import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!user.isAdmin) redirect("/mitt-lag");

  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true },
    orderBy: { matchNumber: "asc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <p className="text-sm text-slate-400">
          Synka resultat automatiskt, eller mata in/justera manuellt. Poängen räknas om direkt.
        </p>
      </div>
      <AdminPanel
        matches={matches.map((m) => ({
          matchNumber: m.matchNumber,
          stage: m.stage,
          home: m.homeTeam ? { id: m.homeTeam.id, label: `${m.homeTeam.flag} ${m.homeTeam.code}` } : null,
          away: m.awayTeam ? { id: m.awayTeam.id, label: `${m.awayTeam.flag} ${m.awayTeam.code}` } : null,
          homeSlot: m.homeSlot,
          awaySlot: m.awaySlot,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          winnerTeamId: m.winnerTeamId,
          status: m.status,
        }))}
      />
    </div>
  );
}
