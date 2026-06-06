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

export interface FormEntry {
  opp: string;    // motståndarens kod
  oppFlag: string;
  score: string;  // "2-1"
  result: "W" | "D" | "L";
  date: string;   // "2026-03-25"
}

// Hämtar senaste n avslutade matcher för ett lag via football-data.org.
// Returnerar en lista med FormEntry sorterad nyast–äldst.
export async function fetchTeamForm(
  teamId: number,
  limit = 5,
): Promise<FormEntry[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY saknas");

  const res = await fetch(
    `https://api.football-data.org/v4/teams/${teamId}/matches?status=FINISHED&limit=${limit}&competitions=2000,2001,2018,2019,2021,2014,2015,2152,2171,2179,2080`,
    { headers: { "X-Auth-Token": key }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = await res.json() as { matches: any[] };
  const matches = (data.matches ?? [])
    .filter((m: any) => m.status === "FINISHED")
    .slice(-limit)
    .reverse();

  return matches.map((m: any) => {
    const isHome = m.homeTeam?.id === teamId;
    const oppTeam = isHome ? m.awayTeam : m.homeTeam;
    const hs: number = m.score?.fullTime?.home ?? 0;
    const as_: number = m.score?.fullTime?.away ?? 0;
    const myScore = isHome ? hs : as_;
    const oppScore = isHome ? as_ : hs;
    const result: "W" | "D" | "L" =
      myScore > oppScore ? "W" : myScore === oppScore ? "D" : "L";
    return {
      opp: oppTeam?.tla ?? oppTeam?.shortName ?? "?",
      oppFlag: "",
      score: `${myScore}–${oppScore}`,
      result,
      date: m.utcDate?.slice(0, 10) ?? "",
    };
  });
}

// ── Matchdetaljer (målgörare, kort, straffar) ────────────────────────────────
// football-data.org gratisnivå saknar dessa. Sätt MATCH_DETAIL_ENDPOINT till en
// URL-mall med {id} (fixture-id) mot ett API som har detaljnivån. Default pekar på
// football-data.org:s match-endpoint (events fylls i på betald nivå). Auth-headern
// och nyckeln kan styras separat för ett annat API.

export interface MatchGoal {
  side: "HOME" | "AWAY"; // relativt API-svarets hemma/borta
  player: string;
  minute: number | null;
  type: string | null; // REGULAR | OWN | PENALTY ...
  assist: string | null;
}
export interface MatchCard {
  side: "HOME" | "AWAY";
  player: string;
  minute: number | null;
  card: "YELLOW" | "RED" | "YELLOW_RED";
}
export interface MatchDetails {
  goals: MatchGoal[];
  cards: MatchCard[];
  shootout: { home: number; away: number } | null;
}

// Som MatchDetails men inkluderar API-svarets lagnamn (normaliserade) så att
// anroparen kan upptäcka om vår match är "flippad" mot API:t och rätta sidorna.
export interface FetchedMatchDetails extends MatchDetails {
  apiHomeName: string | null;
  apiAwayName: string | null;
}

function parseMatchDetails(raw: any): FetchedMatchDetails {
  const m = raw?.match ?? raw ?? {};
  const homeId = m.homeTeam?.id;
  const sideOf = (teamId: unknown): "HOME" | "AWAY" =>
    teamId != null && teamId === homeId ? "HOME" : "AWAY";

  const goals: MatchGoal[] = Array.isArray(m.goals)
    ? m.goals.map((g: any) => ({
        side: sideOf(g.team?.id),
        player: g.scorer?.name ?? g.player?.name ?? "?",
        minute: typeof g.minute === "number" ? g.minute : null,
        type: g.type ?? null,
        assist: g.assist?.name ?? null,
      }))
    : [];

  const cards: MatchCard[] = Array.isArray(m.bookings)
    ? m.bookings.map((c: any) => ({
        side: sideOf(c.team?.id),
        player: c.player?.name ?? "?",
        minute: typeof c.minute === "number" ? c.minute : null,
        card: c.card === "RED" || c.card === "YELLOW_RED" ? c.card : "YELLOW",
      }))
    : [];

  const pen = m.score?.penalties;
  const shootout =
    pen && (pen.home != null || pen.away != null)
      ? { home: pen.home ?? 0, away: pen.away ?? 0 }
      : null;

  return {
    goals,
    cards,
    shootout,
    apiHomeName: normalizeTeamName(m.homeTeam?.name ?? null),
    apiAwayName: normalizeTeamName(m.awayTeam?.name ?? null),
  };
}

// Hämtar detaljer för en match via fixture-id. Returnerar null vid nätverks-/HTTP-fel
// (så anroparen kan försöka igen senare); ett lyckat svar utan events ger tomma listor.
export async function fetchMatchDetails(apiId: string): Promise<FetchedMatchDetails | null> {
  const template =
    process.env.MATCH_DETAIL_ENDPOINT ?? "https://api.football-data.org/v4/matches/{id}";
  const url = template.replace("{id}", encodeURIComponent(apiId));
  const headerName = process.env.MATCH_DETAIL_AUTH_HEADER ?? "X-Auth-Token";
  const key = process.env.MATCH_DETAIL_API_KEY ?? process.env.FOOTBALL_DATA_API_KEY;

  const headers: Record<string, string> = {};
  if (key) headers[headerName] = key;

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  try {
    return parseMatchDetails(await res.json());
  } catch {
    return null;
  }
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
