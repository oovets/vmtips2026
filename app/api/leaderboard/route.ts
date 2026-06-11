import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Topplista för den inloggade spelarens liga (uppdateras via SWR-polling).
// Utloggade besökare ser en publik topplista för den äldsta (default-)ligan.
export async function GET() {
  const me = await getCurrentUser();

  // Vilken liga ska visas? Inloggad = egen liga. Utloggad = äldsta ligan (publik vy).
  let leagueId = me?.leagueId ?? null;
  let leagueName = me?.league.name ?? null;
  if (!leagueId) {
    const defaultLeague = await prisma.league.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!defaultLeague) return NextResponse.json({ leagueName: null, rows: [], liveCount: 0 });
    leagueId = defaultLeague.id;
    leagueName = defaultLeague.name;
  }

  // liveCount låter klienten polla tätare medan matcher pågår (poängen räknas
  // om när en match avslutas, så tätare polling fångar slutsignalen snabbare).
  const [users, liveCount] = await Promise.all([
    prisma.user.findMany({
      where: { leagueId },
      include: {
        score: true,
        bracketPredictions: {
          where: { matchNumber: { in: [101, 102, 104] } },
          select: { matchNumber: true, winnerTeamId: true },
        },
      },
    }),
    prisma.match.count({ where: { status: "LIVE" } }),
  ]);

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
        isMe: me ? u.id === me.id : false,
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

  return NextResponse.json({ leagueName, rows: ranked, liveCount });
}
