// Hämtar resultat från football-data.org, matchar mot våra matcher (på lag-paret),
// uppdaterar mål/vinnare/status och räknar om alla poäng. Delas av cron- och admin-rutterna.

import { prisma } from "./prisma";
import { fetchWorldCupMatches } from "./football-api";
import { recomputeAllScores } from "./scoring-service";

export async function syncResults(): Promise<{ matchesUpdated: number; playersScored: number }> {
  const apiMatches = await fetchWorldCupMatches();
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
  const dbMatches = await prisma.match.findMany();

  let updated = 0;
  for (const am of apiMatches) {
    if (am.homeScore == null || am.awayScore == null) continue;
    const homeId = am.homeName ? teamIdByName.get(am.homeName) : null;
    const awayId = am.awayName ? teamIdByName.get(am.awayName) : null;
    if (!homeId || !awayId) continue;

    const match = dbMatches.find(
      (m) =>
        (m.homeTeamId === homeId && m.awayTeamId === awayId) ||
        (m.homeTeamId === awayId && m.awayTeamId === homeId) ||
        (m.apiId && m.apiId === am.apiId),
    );
    if (!match) continue;

    const flipped = match.homeTeamId === awayId;
    const homeScore = flipped ? am.awayScore : am.homeScore;
    const awayScore = flipped ? am.homeScore : am.awayScore;

    let winnerTeamId: string | null = null;
    if (am.winner === "HOME") winnerTeamId = homeId;
    else if (am.winner === "AWAY") winnerTeamId = awayId;

    const status =
      am.status === "FINISHED"
        ? "FINISHED"
        : am.status === "IN_PLAY" || am.status === "PAUSED"
          ? "LIVE"
          : "SCHEDULED";

    await prisma.match.update({
      where: { id: match.id },
      data: { homeScore, awayScore, winnerTeamId, apiId: am.apiId, status },
    });
    updated++;
  }

  const playersScored = await recomputeAllScores();
  return { matchesUpdated: updated, playersScored };
}
