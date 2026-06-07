import { isAdminAuthed } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "@/components/AdminPanel";
import { AdminLogin } from "@/components/AdminLogin";
import { PageHeading } from "@/components/PageHeading";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminAuthed = await isAdminAuthed();

  // Enbart global admin-PIN ger åtkomst — ingen user.isAdmin-bypass.
  if (!adminAuthed) {
    return <AdminLogin />;
  }

  const [matches, leagues, allTeams, topScorerFact] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { matchNumber: "asc" },
    }),
    prisma.league.findMany({
      include: {
        users: {
          include: { score: true },
          orderBy: { displayName: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.team.findMany({ select: { id: true, name: true, flag: true }, orderBy: { name: "asc" } }),
    prisma.tournamentFact.findUnique({ where: { key: "topScorer" } }),
  ]);

  // ── Tips-status per spelare (för admins fulla insyn i pågående tips) ──────────
  const TOTAL_GROUP_MATCHES = 72;
  const TOTAL_GROUPS = 12;
  const TOTAL_BRACKET_PICKS = 31; // slutspelsval exkl. brons (#103)
  const THIRD_PLACE_MATCH = 103;

  const allUserIds = leagues.flatMap((l) => l.users.map((u) => u.id));
  const modeByUser = new Map<string, "EXACT" | "X12">();
  for (const l of leagues) for (const u of l.users) modeByUser.set(u.id, l.tippingMode as "EXACT" | "X12");

  const [matchPreds, groupPredRows, bracketPreds] = await Promise.all([
    allUserIds.length
      ? prisma.matchPrediction.findMany({
          where: { userId: { in: allUserIds } },
          select: { userId: true, predHome: true, predAway: true, predOutcome: true, match: { select: { matchNumber: true } } },
        })
      : [],
    allUserIds.length
      ? prisma.groupPrediction.groupBy({ by: ["userId"], where: { userId: { in: allUserIds } }, _count: { _all: true } })
      : [],
    allUserIds.length
      ? prisma.bracketPrediction.findMany({
          where: { userId: { in: allUserIds }, winnerTeamId: { not: null }, matchNumber: { not: THIRD_PLACE_MATCH } },
          select: { userId: true },
        })
      : [],
  ]);

  const tippedByUser = new Map<string, number>();
  for (const p of matchPreds) {
    if (p.match.matchNumber < 1 || p.match.matchNumber > TOTAL_GROUP_MATCHES) continue;
    const mode = modeByUser.get(p.userId);
    const filled = mode === "X12" ? p.predOutcome != null : p.predHome != null && p.predAway != null;
    if (filled) tippedByUser.set(p.userId, (tippedByUser.get(p.userId) ?? 0) + 1);
  }
  const groupsByUser = new Map<string, number>();
  for (const g of groupPredRows) groupsByUser.set(g.userId, g._count._all);
  const bracketByUser = new Map<string, number>();
  for (const b of bracketPreds) bracketByUser.set(b.userId, (bracketByUser.get(b.userId) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <PageHeading
        title="Admin"
      >
      <AdminPanel
        teams={allTeams}
        topScorer={{ player: topScorerFact?.value ?? "", teamId: topScorerFact?.teamId ?? "" }}
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
          channel: m.channel,
        }))}
        leagues={leagues.map((l) => ({
          id: l.id,
          name: l.name,
          joinCode: l.joinCode,
          users: l.users.map((u) => ({
            id: u.id,
            displayName: u.displayName,
            isAdmin: u.isAdmin,
            submitted: u.submitted,
            score: u.score?.total ?? null,
            tips: {
              matches: tippedByUser.get(u.id) ?? 0,
              matchesTotal: TOTAL_GROUP_MATCHES,
              groups: groupsByUser.get(u.id) ?? 0,
              groupsTotal: TOTAL_GROUPS,
              bracket: bracketByUser.get(u.id) ?? 0,
              bracketTotal: TOTAL_BRACKET_PICKS,
            },
          })),
        }))}
      />
      </PageHeading>
    </div>
  );
}
