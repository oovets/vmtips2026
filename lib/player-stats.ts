// Detaljerad statistik per spelare härledd ur deras tips. Rena funktioner —
// inga DB-anrop här (anroparen slår upp lagnamn och skickar in rådata).

export interface RawMatchPred {
  matchNumber: number;
  predHome: number | null;
  predAway: number | null;
  predOutcome: string | null;
}
export interface RawBracketPred {
  matchNumber: number;
  team1Id: string | null;
  team2Id: string | null;
  winnerTeamId: string | null;
}
export interface RawGroupPred {
  groupId: string;
  rank1TeamId: string;
  rank2TeamId: string;
  rank3TeamId: string;
  rank4TeamId: string;
}

export interface DerivedStats {
  tippedMatches: number; // antal gruppmatcher med tips (av 72)
  groupRankingsSet: number; // antal grupper med rankning (av 12)
  bracketWinnersSet: number; // antal slutspelsval (exkl. brons #103, av 31)
  totalGoals: number | null; // summa mål i alla gruppmatchtips (endast EXACT)
  avgGoals: number | null; // mål/match (endast EXACT)
  outcomeDist: { home: number; draw: number; away: number }; // 1/X/2-fördelning
  topScoreline: { label: string; count: number } | null; // vanligaste resultat (EXACT)
  biggestPrediction: { home: number; away: number; goals: number } | null; // målrikaste tips
  drawShare: number; // andel kryss av tippade matcher (0–100)
}

const KO_THIRD = 103;

function filled(mode: "EXACT" | "X12", p: RawMatchPred): boolean {
  return mode === "X12" ? p.predOutcome != null : p.predHome != null && p.predAway != null;
}

function outcomeOf(mode: "EXACT" | "X12", p: RawMatchPred): "1" | "X" | "2" | null {
  if (mode === "X12") return (p.predOutcome as "1" | "X" | "2" | null) ?? null;
  if (p.predHome == null || p.predAway == null) return null;
  return p.predHome > p.predAway ? "1" : p.predHome < p.predAway ? "2" : "X";
}

export function computeDerivedStats(
  mode: "EXACT" | "X12",
  matchPreds: RawMatchPred[],
  groupPreds: RawGroupPred[],
  bracketPreds: RawBracketPred[],
): DerivedStats {
  const tipped = matchPreds.filter((p) => filled(mode, p));
  const dist = { home: 0, draw: 0, away: 0 };
  let totalGoals = 0;
  let biggest: DerivedStats["biggestPrediction"] = null;
  const scorelineCount = new Map<string, number>();

  for (const p of tipped) {
    const o = outcomeOf(mode, p);
    if (o === "1") dist.home++;
    else if (o === "2") dist.away++;
    else if (o === "X") dist.draw++;

    if (mode === "EXACT" && p.predHome != null && p.predAway != null) {
      const goals = p.predHome + p.predAway;
      totalGoals += goals;
      if (!biggest || goals > biggest.goals) biggest = { home: p.predHome, away: p.predAway, goals };
      const key = `${p.predHome}–${p.predAway}`;
      scorelineCount.set(key, (scorelineCount.get(key) ?? 0) + 1);
    }
  }

  let topScoreline: DerivedStats["topScoreline"] = null;
  for (const [label, count] of scorelineCount) {
    if (!topScoreline || count > topScoreline.count) topScoreline = { label, count };
  }

  const n = tipped.length;
  return {
    tippedMatches: n,
    groupRankingsSet: groupPreds.length,
    bracketWinnersSet: bracketPreds.filter((b) => b.winnerTeamId && b.matchNumber !== KO_THIRD).length,
    totalGoals: mode === "EXACT" ? totalGoals : null,
    avgGoals: mode === "EXACT" && n ? Math.round((totalGoals / n) * 100) / 100 : null,
    outcomeDist: dist,
    topScoreline,
    biggestPrediction: biggest,
    drawShare: n ? Math.round((dist.draw / n) * 100) : 0,
  };
}

// Mest tippade segrarlag över hela slutspelsträdet (exkl. brons). Returnerar lag-id.
export function favoriteTeamId(bracketPreds: RawBracketPred[]): { teamId: string; count: number } | null {
  const count = new Map<string, number>();
  for (const b of bracketPreds) {
    if (!b.winnerTeamId || b.matchNumber === KO_THIRD) continue;
    count.set(b.winnerTeamId, (count.get(b.winnerTeamId) ?? 0) + 1);
  }
  let best: { teamId: string; count: number } | null = null;
  for (const [teamId, c] of count) {
    if (!best || c > best.count) best = { teamId, count: c };
  }
  return best;
}
