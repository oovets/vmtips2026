import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked } from "@/lib/lock";
import { TippingForm } from "@/components/TippingForm";

export const dynamic = "force-dynamic";

export default async function MittLagPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [teams, groupMatches, matchPreds, bracketPreds] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true, code: true, flag: true, fifaRank: true, groupId: true },
    }),
    prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { matchNumber: true, groupId: true, homeTeamId: true, awayTeamId: true, kickoff: true },
      orderBy: { matchNumber: "asc" },
    }),
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      include: { match: { select: { matchNumber: true } } },
    }),
    prisma.bracketPrediction.findMany({ where: { userId: user.id } }),
  ]);

  const scores: Record<number, { h: number; a: number }> = {};
  for (const p of matchPreds) scores[p.match.matchNumber] = { h: p.predHome, a: p.predAway };

  const koWinners: Record<number, string> = {};
  for (const b of bracketPreds) if (b.winnerTeamId) koWinners[b.matchNumber] = b.winnerTeamId;

  return (
    <TippingForm
      teams={teams}
      groupMatches={groupMatches.map((m) => ({
        matchNumber: m.matchNumber,
        groupId: m.groupId!,
        homeTeamId: m.homeTeamId!,
        awayTeamId: m.awayTeamId!,
        kickoff: m.kickoff.toISOString(),
      }))}
      initial={{ scores, koWinners }}
      locked={isLocked()}
      submitted={user.submitted}
    />
  );
}
