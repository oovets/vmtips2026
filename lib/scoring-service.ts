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
import { rankRows } from "./rank";

export async function recomputeAllScores(): Promise<number> {
  const [teams, matches, users, matchPreds, groupPreds, bracketPreds, topScorerFact, existingScores] =
    await Promise.all([
      prisma.team.findMany(),
      prisma.match.findMany(),
      prisma.user.findMany(),
      prisma.matchPrediction.findMany(),
      prisma.groupPrediction.findMany(),
      prisma.bracketPrediction.findMany(),
      prisma.tournamentFact.findUnique({ where: { key: "topScorer" } }),
      prisma.score.findMany({ select: { userId: true, currentRank: true } }),
    ]);

  // Föregående omgångs placering per spelare (currentRank blir nu previousRank).
  const prevCurrentRank = new Map<string, number | null>(
    existingScores.map((s) => [s.userId, s.currentRank]),
  );

  const topScorerActual = topScorerFact?.value ?? null;

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

  // Steg 1: räkna fram varje spelares totalpoäng + breakdown.
  const computed = new Map<
    string,
    { total: number; breakdownJson: Prisma.InputJsonObject; leagueId: string; displayName: string }
  >();
  for (const user of users) {
    const mPreds = (matchPredsByUser.get(user.id) ?? [])
      .map((p) => ({
        matchNumber: matchNumberById.get(p.matchId)!,
        predHome: p.predHome,
        predAway: p.predAway,
      }))
      .filter((p) => p.matchNumber != null && p.predHome != null && p.predAway != null) as Array<{
        matchNumber: number;
        predHome: number;
        predAway: number;
      }>;

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
      topScorerPred: user.topScorerPlayer,
      topScorerActual,
    };
    const breakdown = computeScore(input);
    const breakdownJson = breakdown as unknown as Prisma.InputJsonObject;
    computed.set(user.id, {
      total: breakdown.total,
      breakdownJson,
      leagueId: user.leagueId,
      displayName: user.displayName,
    });
  }

  // Steg 2: placering inom varje liga (samma semantik som översikten via
  // rankRows). Lika totalpoäng delar placering. currentRank skiftas till
  // previousRank så att trenden upp/ner kan härledas vid nästa visning.
  const usersByLeague = groupBy([...computed.entries()], ([, c]) => c.leagueId);
  const newRank = new Map<string, number>();
  for (const [, entries] of usersByLeague) {
    const ranked = rankRows(
      entries.map(([userId, c]) => ({ userId, total: c.total, displayName: c.displayName })),
    );
    for (const r of ranked) newRank.set(r.row.userId, r.rank);
  }

  const now = new Date();
  const writes = [...computed.entries()].map(([userId, c]) => {
    const currentRank = newRank.get(userId) ?? null;
    const previousRank = prevCurrentRank.get(userId) ?? null;
    return prisma.score.upsert({
      where: { userId },
      update: {
        total: c.total,
        breakdown: c.breakdownJson,
        previousRank,
        currentRank,
        rankUpdatedAt: now,
      },
      create: {
        userId,
        total: c.total,
        breakdown: c.breakdownJson,
        currentRank,
        rankUpdatedAt: now,
      },
    });
  });

  await prisma.$transaction(writes);
  return writes.length;
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    (map.get(k) ?? map.set(k, []).get(k)!).push(item);
  }
  return map;
}
