// Server-orkestrering: läser facit + alla tips från DB, räknar om varje spelares
// poäng och cachar i Score-tabellen. Anropas efter varje resultatsynk.

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  computeAllStandings,
  type ResultRef,
  type TeamRef,
} from "./standings";
import { teamsReachingStages, type Winners } from "./bracket";
import { computeScore, type ScoringInput, type Stage } from "./scoring";

export async function recomputeAllScores(): Promise<number> {
  const [teams, matches, users, matchPreds, groupPreds, bracketPreds] =
    await Promise.all([
      prisma.team.findMany(),
      prisma.match.findMany(),
      prisma.user.findMany(),
      prisma.matchPrediction.findMany(),
      prisma.groupPrediction.findMany(),
      prisma.bracketPrediction.findMany(),
    ]);

  const matchNumberById = new Map(matches.map((m) => [m.id, m.matchNumber]));

  // --- Facit: gruppmatcher ---
  const finishedGroup = matches.filter(
    (m) =>
      m.stage === "GROUP" &&
      m.status === "FINISHED" &&
      m.homeTeamId &&
      m.awayTeamId &&
      m.homeScore != null &&
      m.awayScore != null,
  );
  const actualResults: ResultRef[] = finishedGroup.map((m) => ({
    homeTeamId: m.homeTeamId!,
    awayTeamId: m.awayTeamId!,
    homeScore: m.homeScore!,
    awayScore: m.awayScore!,
  }));
  const groupResults = finishedGroup.map((m) => ({
    matchNumber: m.matchNumber,
    homeScore: m.homeScore!,
    awayScore: m.awayScore!,
  }));

  const teamsByGroup: Record<string, TeamRef[]> = {};
  for (const t of teams) {
    (teamsByGroup[t.groupId] ??= []).push({
      id: t.id,
      groupId: t.groupId,
      fifaRank: t.fifaRank,
    });
  }
  const actualStandings = computeAllStandings(teamsByGroup, actualResults);

  // Topp-2 räknas bara för färdigspelade grupper (alla 6 matcher klara).
  const finishedPerGroup: Record<string, number> = {};
  for (const m of finishedGroup)
    finishedPerGroup[m.groupId!] = (finishedPerGroup[m.groupId!] ?? 0) + 1;

  const actualTop2: Record<string, { rank1: string; rank2: string }> = {};
  for (const [groupId, st] of Object.entries(actualStandings)) {
    if (finishedPerGroup[groupId] === 6 && st[0] && st[1]) {
      actualTop2[groupId] = { rank1: st[0].teamId, rank2: st[1].teamId };
    }
  }

  // --- Facit: slutspel (vinnare per match) ---
  const actualWinners: Winners = {};
  for (const m of matches) if (m.winnerTeamId) actualWinners[m.matchNumber] = m.winnerTeamId;
  const actualReach = teamsReachingStages({}, actualWinners);

  // --- Per spelare ---
  const matchPredsByUser = groupBy(matchPreds, (p) => p.userId);
  const groupPredsByUser = groupBy(groupPreds, (p) => p.userId);
  const bracketPredsByUser = groupBy(bracketPreds, (p) => p.userId);

  let updated = 0;
  for (const user of users) {
    const mPreds = (matchPredsByUser.get(user.id) ?? [])
      .map((p) => ({
        matchNumber: matchNumberById.get(p.matchId)!,
        predHome: p.predHome,
        predAway: p.predAway,
      }))
      .filter((p) => p.matchNumber != null);

    const gPreds = (groupPredsByUser.get(user.id) ?? []).map((p) => ({
      groupId: p.groupId,
      rank1: p.rank1TeamId,
      rank2: p.rank2TeamId,
    }));

    const predWinners: Winners = {};
    for (const bp of bracketPredsByUser.get(user.id) ?? [])
      if (bp.winnerTeamId) predWinners[bp.matchNumber] = bp.winnerTeamId;
    const predReach = teamsReachingStages({}, predWinners);

    const input: ScoringInput = {
      groupResults,
      matchPreds: mPreds,
      actualTop2,
      groupPreds: gPreds,
      actualReach,
      predReach,
    };
    const breakdown = computeScore(input);
    const breakdownJson = breakdown as unknown as Prisma.InputJsonObject;

    await prisma.score.upsert({
      where: { userId: user.id },
      update: { total: breakdown.total, breakdown: breakdownJson },
      create: { userId: user.id, total: breakdown.total, breakdown: breakdownJson },
    });
    updated++;
  }
  return updated;
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    (map.get(k) ?? map.set(k, []).get(k)!).push(item);
  }
  return map;
}
