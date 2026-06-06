// Aggregerar turneringsstatistik från våra matcher (resultat + sparade detaljer).
// Rena funktioner — matchdata hämtas av anroparen (server component).

interface MatchLite {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  details: unknown;
}

interface DetailsShape {
  goals?: { player: string; type: string | null }[];
  cards?: { card: "YELLOW" | "RED" | "YELLOW_RED" }[];
  shootout?: { home: number; away: number } | null;
}

export interface TournamentMetrics {
  matchesPlayed: number;
  totalGoals: number;
  goalsPerMatch: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  shootouts: number;
  biggestWin: { diff: number; homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number } | null;
  topScoringTeams: { teamId: string; goals: number }[];
  topScorers: { player: string; goals: number }[];
}

export function computeTournamentMetrics(matches: MatchLite[]): TournamentMetrics {
  const finished = matches.filter(
    (m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null,
  );

  let totalGoals = 0;
  let cleanSheets = 0;
  let yellowCards = 0;
  let redCards = 0;
  let shootouts = 0;
  let biggestWin: TournamentMetrics["biggestWin"] = null;

  const teamGoals = new Map<string, number>();
  const scorerGoals = new Map<string, number>();

  for (const m of finished) {
    const hs = m.homeScore!;
    const as = m.awayScore!;
    totalGoals += hs + as;
    if (hs === 0) cleanSheets++;
    if (as === 0) cleanSheets++;

    if (m.homeTeamId) teamGoals.set(m.homeTeamId, (teamGoals.get(m.homeTeamId) ?? 0) + hs);
    if (m.awayTeamId) teamGoals.set(m.awayTeamId, (teamGoals.get(m.awayTeamId) ?? 0) + as);

    const diff = Math.abs(hs - as);
    if (m.homeTeamId && m.awayTeamId && (!biggestWin || diff > biggestWin.diff)) {
      biggestWin = { diff, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: hs, awayScore: as };
    }

    const d = (m.details ?? null) as DetailsShape | null;
    if (d) {
      for (const c of d.cards ?? []) {
        if (c.card === "RED" || c.card === "YELLOW_RED") redCards++;
        else yellowCards++;
      }
      if (d.shootout) shootouts++;
      for (const g of d.goals ?? []) {
        if (g.type === "OWN") continue;
        const name = g.player?.trim();
        if (name && name !== "?") scorerGoals.set(name, (scorerGoals.get(name) ?? 0) + 1);
      }
    }
  }

  const topScoringTeams = [...teamGoals.entries()]
    .map(([teamId, goals]) => ({ teamId, goals }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);

  const topScorers = [...scorerGoals.entries()]
    .map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);

  return {
    matchesPlayed: finished.length,
    totalGoals,
    goalsPerMatch: finished.length ? Math.round((totalGoals / finished.length) * 100) / 100 : 0,
    cleanSheets,
    yellowCards,
    redCards,
    shootouts,
    biggestWin,
    topScoringTeams,
    topScorers,
  };
}
