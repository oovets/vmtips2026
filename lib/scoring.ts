// Poängsystem — rena funktioner (lätt att enhetstesta). Justera SCORING för att
// ändra spelets balans.

export const SCORING = {
  exactScore: 5, // exakt resultat i gruppmatch
  correctGoalDiff: 3, // rätt utfall + rätt målskillnad
  correctOutcome: 2, // rätt utfall (1/X/2)
  advanceTeam: 3, // per lag som korrekt tippats gå vidare (topp 2)
  advanceOrderBonus: 2, // bonus om båda topp-2 i exakt rätt ordning
  ko: { R16: 2, QF: 4, SF: 6, FINAL: 8 } as Record<string, number>, // lag som når rundan
  champion: 15, // rätt världsmästare
};

export type Stage = "R16" | "QF" | "SF" | "FINAL";

export interface ScoringInput {
  groupResults: { matchNumber: number; homeScore: number; awayScore: number }[];
  matchPreds: { matchNumber: number; predHome: number; predAway: number }[];
  actualTop2: Record<string, { rank1: string; rank2: string }>; // groupId -> facit
  groupPreds: { groupId: string; rank1: string; rank2: string }[];
  actualReach: Record<Stage | "CHAMPION", Set<string>>;
  predReach: Record<Stage | "CHAMPION", Set<string>>;
}

export interface Breakdown {
  groupMatches: number;
  advancement: number;
  knockout: number;
  champion: number;
  total: number;
  exactCount: number;
  correctOutcomeCount: number;
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function scoreGroupMatch(
  pred: { predHome: number; predAway: number },
  res: { homeScore: number; awayScore: number },
): { points: number; exact: boolean; correct: boolean } {
  const exact =
    pred.predHome === res.homeScore && pred.predAway === res.awayScore;
  if (exact) return { points: SCORING.exactScore, exact: true, correct: true };

  const correct =
    sign(pred.predHome - pred.predAway) === sign(res.homeScore - res.awayScore);
  if (!correct) return { points: 0, exact: false, correct: false };

  const sameDiff = pred.predHome - pred.predAway === res.homeScore - res.awayScore;
  return {
    points: sameDiff ? SCORING.correctGoalDiff : SCORING.correctOutcome,
    exact: false,
    correct: true,
  };
}

export function computeScore(input: ScoringInput): Breakdown {
  const b: Breakdown = {
    groupMatches: 0,
    advancement: 0,
    knockout: 0,
    champion: 0,
    total: 0,
    exactCount: 0,
    correctOutcomeCount: 0,
  };

  // 1. Gruppmatcher
  const resByNum = new Map(input.groupResults.map((r) => [r.matchNumber, r]));
  for (const p of input.matchPreds) {
    const res = resByNum.get(p.matchNumber);
    if (!res) continue;
    const s = scoreGroupMatch(p, res);
    b.groupMatches += s.points;
    if (s.exact) b.exactCount++;
    if (s.correct) b.correctOutcomeCount++;
  }

  // 2. Vidare ur grupp
  const predByGroup = new Map(input.groupPreds.map((g) => [g.groupId, g]));
  for (const [groupId, actual] of Object.entries(input.actualTop2)) {
    const pred = predByGroup.get(groupId);
    if (!pred) continue;
    const actualSet = new Set([actual.rank1, actual.rank2]);
    if (actualSet.has(pred.rank1)) b.advancement += SCORING.advanceTeam;
    if (actualSet.has(pred.rank2)) b.advancement += SCORING.advanceTeam;
    if (pred.rank1 === actual.rank1 && pred.rank2 === actual.rank2)
      b.advancement += SCORING.advanceOrderBonus;
  }

  // 3. Slutspel — lag som nått varje runda
  for (const stage of ["R16", "QF", "SF", "FINAL"] as Stage[]) {
    const pts = SCORING.ko[stage];
    for (const teamId of input.predReach[stage]) {
      if (input.actualReach[stage].has(teamId)) b.knockout += pts;
    }
  }

  // 4. Världsmästare
  for (const teamId of input.predReach.CHAMPION) {
    if (input.actualReach.CHAMPION.has(teamId)) b.champion += SCORING.champion;
  }

  b.total = b.groupMatches + b.advancement + b.knockout + b.champion;
  return b;
}
