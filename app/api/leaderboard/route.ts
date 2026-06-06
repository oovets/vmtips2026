import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Topplista för den inloggade spelarens liga (uppdateras via SWR-polling).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { leagueId: me.leagueId },
    include: {
      score: true,
      bracketPredictions: {
        where: { matchNumber: { in: [101, 102, 104] } },
        select: { matchNumber: true, winnerTeamId: true },
      },
    },
  });

  // Slå upp lagnamn för spelarnas tippade finalister/mästare.
  const teamIds = users
    .flatMap((u) => u.bracketPredictions.map((p) => p.winnerTeamId))
    .filter((x): x is string => !!x);
  const teams = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, code: true, flag: true },
      })
    : [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const tag = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? { code: t.code, flag: t.flag } : null;
  };

  const rows = users
    .map((u) => {
      const champId = u.bracketPredictions.find((p) => p.matchNumber === 104)?.winnerTeamId ?? null;
      const finalists = [101, 102]
        .map((n) => tag(u.bracketPredictions.find((p) => p.matchNumber === n)?.winnerTeamId))
        .filter((x): x is { code: string; flag: string } => !!x);
      return {
        id: u.id,
        displayName: u.displayName,
        submitted: u.submitted,
        total: u.score?.total ?? 0,
        breakdown: (u.score?.breakdown as Record<string, number> | null) ?? null,
        champion: tag(champId),
        finalists,
        isMe: u.id === me.id,
      };
    })
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));

  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    if (prev === null || r.total !== prev) rank = i + 1;
    prev = r.total;
    return { ...r, rank };
  });

  return NextResponse.json({ leagueName: me.league.name, rows: ranked });
}
