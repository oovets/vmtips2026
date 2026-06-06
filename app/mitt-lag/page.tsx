import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked } from "@/lib/lock";
import { TippingForm } from "@/components/TippingForm";
import type { FormEntry } from "@/components/TeamPill";

export const dynamic = "force-dynamic";

export default async function MittLagPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [teams, groupMatches, matchPreds, bracketPreds] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, name: true, code: true, flag: true, fifaRank: true, groupId: true, recentForm: true },
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

  const tippingMode = user.league.tippingMode as "EXACT" | "X12";

  const scores: Record<number, { h: number; a: number }> = {};
  const outcomes: Record<number, "1" | "X" | "2"> = {};

  for (const p of matchPreds) {
    const n = p.match.matchNumber;
    if (p.predHome != null && p.predAway != null) {
      scores[n] = { h: p.predHome, a: p.predAway };
    }
    if (p.predOutcome) {
      outcomes[n] = p.predOutcome as "1" | "X" | "2";
    }
  }

  const koWinners: Record<number, string> = {};
  for (const b of bracketPreds) if (b.winnerTeamId) koWinners[b.matchNumber] = b.winnerTeamId;

  const mappedTeams = teams.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    flag: t.flag,
    fifaRank: t.fifaRank,
    groupId: t.groupId,
    recentForm: Array.isArray(t.recentForm) ? (t.recentForm as unknown as FormEntry[]) : [],
  }));

  return (
    <TippingForm
      teams={mappedTeams}
      groupMatches={groupMatches.map((m) => ({
        matchNumber: m.matchNumber,
        groupId: m.groupId!,
        homeTeamId: m.homeTeamId!,
        awayTeamId: m.awayTeamId!,
        kickoff: m.kickoff.toISOString(),
      }))}
      initial={{ scores, outcomes, koWinners }}
      locked={isLocked()}
      submitted={user.submitted}
      tippingMode={tippingMode}
    />
  );
}
