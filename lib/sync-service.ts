// Hämtar resultat från football-data.org, matchar mot våra matcher (på lag-paret),
// uppdaterar mål/vinnare/status och räknar om alla poäng. Delas av cron- och admin-rutterna.

import { prisma } from "./prisma";
import {
  fetchWorldCupMatches,
  fetchMatchDetails,
  normalizeTeamName,
  type MatchDetails,
} from "./football-api";
import { recomputeAllScores } from "./scoring-service";
import { Prisma } from "@prisma/client";

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

// Vänder sidorna (HOME<->AWAY) när vår match är flippad mot API-svaret.
function flipDetails(d: MatchDetails): MatchDetails {
  const flip = (s: "HOME" | "AWAY") => (s === "HOME" ? "AWAY" : "HOME");
  return {
    goals: d.goals.map((g) => ({ ...g, side: flip(g.side) })),
    cards: d.cards.map((c) => ({ ...c, side: flip(c.side) })),
    shootout: d.shootout ? { home: d.shootout.away, away: d.shootout.home } : null,
  };
}

// Hämtar matchdetaljer (målgörare, kort, straffar) för matcher med fixture-id.
// Pågående matcher uppdateras varje körning; avslutade matcher hämtas en sista
// gång (markeras `final`) och rörs sedan inte igen. Begränsas av `limit` för att
// respektera API:ts rate-limit — resten backfillas nästa körning.
// Kräver MATCH_DETAIL_ENDPOINT/-nyckel för att ge data.
export async function syncMatchDetails(
  opts: { limit?: number } = {},
): Promise<{ detailsUpdated: number }> {
  const limit = opts.limit ?? 10;

  const rows = await prisma.match.findMany({
    where: { apiId: { not: null }, status: { in: ["LIVE", "FINISHED"] } },
    select: {
      id: true,
      apiId: true,
      status: true,
      details: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { matchNumber: "asc" },
  });

  // LIVE hämtas alltid; FINISHED bara tills den hämtats efter slutsignal (final).
  const worklist = rows
    .filter((m) => {
      if (m.status === "LIVE") return true;
      const d = m.details as { final?: boolean } | null;
      return !d || d.final !== true;
    })
    .slice(0, limit);

  let detailsUpdated = 0;
  for (const m of worklist) {
    const fetched = await fetchMatchDetails(m.apiId!);
    if (!fetched) continue; // nätverks-/HTTP-fel: försök igen nästa körning

    const { apiHomeName, apiAwayName, ...details } = fetched;

    // Upptäck om vår match är flippad mot API:t (jämför normaliserade lagnamn).
    const ourHome = m.homeTeam?.name ?? null;
    const ourAway = m.awayTeam?.name ?? null;
    const flipped =
      ourHome != null &&
      ourAway != null &&
      normalizeTeamName(apiHomeName) === ourAway &&
      normalizeTeamName(apiAwayName) === ourHome;

    const oriented: MatchDetails = flipped ? flipDetails(details) : details;
    const stored = { ...oriented, final: m.status === "FINISHED" };

    await prisma.match.update({
      where: { id: m.id },
      data: { details: stored as unknown as Prisma.InputJsonValue },
    });
    detailsUpdated++;
  }

  return { detailsUpdated };
}
