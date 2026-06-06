// Adapter mot football-data.org (gratisnivå, competition "WC"). Hämtar matcher
// och normaliserar lagnamn till våra kanoniska namn (lib/teams.ts).
// Best-effort: admin-override i /admin täcker det API:t missar.

export interface ApiMatch {
  apiId: string;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED ...
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: "HOME" | "AWAY" | "DRAW" | null;
}

// football-data.org-namn -> våra namn (i lib/teams.ts)
const ALIASES: Record<string, string> = {
  Czechia: "Czech Republic",
  Türkiye: "Turkey",
  Turkey: "Turkey",
  "Korea Republic": "South Korea",
  "United States": "USA",
  "IR Iran": "Iran",
  "Côte d'Ivoire": "Ivory Coast",
  "Cabo Verde": "Cape Verde",
  "DR Congo": "DR Congo",
  "Congo DR": "DR Congo",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "Saudi Arabia": "Saudi Arabia",
  Curacao: "Curaçao",
};

export function normalizeTeamName(name: string | null): string | null {
  if (!name) return null;
  return ALIASES[name] ?? name;
}

export async function fetchWorldCupMatches(): Promise<ApiMatch[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY saknas");

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    { headers: { "X-Auth-Token": key }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`football-data.org svarade ${res.status}`);
  }
  const data = (await res.json()) as { matches: any[] };

  return (data.matches ?? []).map((m) => ({
    apiId: String(m.id),
    utcDate: m.utcDate,
    status: m.status,
    homeName: normalizeTeamName(m.homeTeam?.name ?? null),
    awayName: normalizeTeamName(m.awayTeam?.name ?? null),
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    winner: m.score?.winner ?? null,
  }));
}
