// Server: bygger QuizData från DB:n, genererar frågesett och hjälpare för dagsnyckel.

import { prisma } from "./prisma";
import { computeAllStandings, type ResultRef, type TeamRef } from "./standings";
import { buildQuestionPool, selectQuiz, QUIZ, type QuizData, type Question } from "./quiz";

// "2026-06-13" i svensk tid — nyckel för daglig quiz.
export function stockholmDayKey(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

export async function buildQuizData(): Promise<QuizData> {
  const [teams, finished] = await Promise.all([
    prisma.team.findMany(),
    prisma.match.findMany({
      where: {
        stage: "GROUP",
        status: "FINISHED",
        homeTeamId: { not: null },
        awayTeamId: { not: null },
        homeScore: { not: null },
        awayScore: { not: null },
      },
    }),
  ]);

  // Målskyttar ligger som JSON-händelser på matchen (Match.details.goals).
  type DetailGoal = { side?: string; player?: string; type?: string };
  const goals: { matchNumber: number; teamId: string; scorer: string; ownGoal: boolean }[] = [];
  for (const m of finished) {
    const det = m.details as { goals?: DetailGoal[] } | null;
    if (!det?.goals || !m.homeTeamId || !m.awayTeamId) continue;
    for (const g of det.goals) {
      if (!g.player) continue;
      const side = g.side?.toUpperCase();
      const teamId = side === "HOME" ? m.homeTeamId : side === "AWAY" ? m.awayTeamId : null;
      if (!teamId) continue;
      goals.push({
        matchNumber: m.matchNumber,
        teamId,
        scorer: g.player,
        ownGoal: /own/i.test(g.type ?? ""),
      });
    }
  }

  const matches = finished.map((m) => ({
    matchNumber: m.matchNumber,
    groupId: m.groupId,
    homeTeamId: m.homeTeamId!,
    awayTeamId: m.awayTeamId!,
    homeScore: m.homeScore!,
    awayScore: m.awayScore!,
  }));

  // Tabeller — endast färdigspelade grupper (alla 6 matcher klara).
  const teamsByGroup: Record<string, TeamRef[]> = {};
  for (const t of teams)
    (teamsByGroup[t.groupId] ??= []).push({ id: t.id, groupId: t.groupId, fifaRank: t.fifaRank });
  const results: ResultRef[] = matches.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));
  const allStandings = computeAllStandings(teamsByGroup, results);
  const finishedPerGroup: Record<string, number> = {};
  for (const m of matches) if (m.groupId) finishedPerGroup[m.groupId] = (finishedPerGroup[m.groupId] ?? 0) + 1;

  const standings: Record<string, { teamId: string; rank: number; gf: number }[]> = {};
  for (const [g, st] of Object.entries(allStandings)) {
    if (finishedPerGroup[g] === 6) standings[g] = st.map((s) => ({ teamId: s.teamId, rank: s.rank, gf: s.gf }));
  }

  return {
    teams: teams.map((t) => ({ id: t.id, name: t.name, code: t.code, flag: t.flag, groupId: t.groupId })),
    matches,
    standings,
    goals,
  };
}

// Genererar ett frågesett (eller null om för få matcher spelats).
export async function generateQuestions(): Promise<Question[] | null> {
  const data = await buildQuizData();
  const pool = buildQuestionPool(data);
  if (pool.length < QUIZ.minPoolSize) return null;
  return selectQuiz(pool, QUIZ.questionsPerRound);
}

// Finns det tillräckligt med data för att erbjuda quiz?
export async function quizAvailable(): Promise<boolean> {
  const data = await buildQuizData();
  return buildQuestionPool(data).length >= QUIZ.minPoolSize;
}
