// Adapter mot ESPN:s öppna API (gratis, ingen nyckel) för matchresultat, målskyttar,
// kort och xG. Returnerar SAMMA shapes som tidigare (ApiMatch / MatchDetails) så att
// sync-service och övriga features fungerar oförändrat. Lag matchas via abbreviation
// (= våra FIFA-koder i lib/teams.ts) -> våra kanoniska lagnamn.
//
// fetchTeamForm() ligger kvar på football-data.org (lag-form, utanför ESPN-scope).

import { TEAMS } from "./teams";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
const TOURNAMENT_RANGE = "20260611-20260720";

// Kod -> vårt lagnamn (DB-namn). ESPN abbreviation == vår kod i de allra flesta fall.
const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TEAMS).map(([name, meta]) => [meta.code, name]),
);
// ESPN-abbreviation -> vår kod, för ev. avvikelser. Fylls på vid behov.
const ESPN_CODE_ALIASES: Record<string, string> = {};

function espnTeamName(abbr: string | undefined): string | null {
  if (!abbr) return null;
  const code = ESPN_CODE_ALIASES[abbr] ?? abbr;
  return NAME_BY_CODE[code] ?? null;
}

function parseMinute(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export interface ApiMatch {
  apiId: string;
  utcDate: string;
  status: string; // SCHEDULED | IN_PLAY | FINISHED
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: "HOME" | "AWAY" | "DRAW" | null;
}

// football-data.org-namn -> våra namn (används av fetchTeamForm m.fl.)
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
  opp: string;
  oppFlag: string;
  score: string;
  result: "W" | "D" | "L";
  date: string;
}

// Lag-form via football-data.org (utanför ESPN-scope — kräver FOOTBALL_DATA_API_KEY).
export async function fetchTeamForm(teamId: number, limit = 5): Promise<FormEntry[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY saknas");

  const res = await fetch(
    `https://api.football-data.org/v4/teams/${teamId}/matches?status=FINISHED&limit=${limit}&competitions=2000,2001,2018,2019,2021,2014,2015,2152,2171,2179,2080`,
    { headers: { "X-Auth-Token": key }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { matches: any[] };
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
    const result: "W" | "D" | "L" = myScore > oppScore ? "W" : myScore === oppScore ? "D" : "L";
    return {
      opp: oppTeam?.tla ?? oppTeam?.shortName ?? "?",
      oppFlag: "",
      score: `${myScore}–${oppScore}`,
      result,
      date: m.utcDate?.slice(0, 10) ?? "",
    };
  });
}

// ── Matchdetaljer (målgörare, kort, straffar, xG) från ESPN ───────────────────

export interface MatchGoal {
  side: "HOME" | "AWAY"; // relativt API-svarets hemma/borta
  player: string;
  minute: number | null;
  type: string | null; // REGULAR | OWN | PENALTY
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
  xg?: { home: number | null; away: number | null } | null; // best-effort, null om ESPN saknar det
}

export interface FetchedMatchDetails extends MatchDetails {
  apiHomeName: string | null;
  apiAwayName: string | null;
}

function extractXg(
  summary: any,
  homeId: string | undefined,
  awayId: string | undefined,
): { home: number | null; away: number | null } | null {
  const teams: any[] = summary?.boxscore?.teams ?? [];
  const valFor = (tid: string | undefined): number | null => {
    if (!tid) return null;
    const t = teams.find((x) => String(x.team?.id) === String(tid));
    const stat = (t?.statistics ?? []).find(
      (x: any) => /expectedgoals/i.test(x.name ?? "") || /expected goals/i.test(x.displayName ?? x.label ?? ""),
    );
    if (!stat) return null;
    const v = parseFloat(stat.displayValue ?? stat.value);
    return Number.isFinite(v) ? v : null;
  };
  const home = valFor(homeId);
  const away = valFor(awayId);
  return home != null || away != null ? { home, away } : null;
}

// Hämtar detaljer för en match via ESPN summary (event-id = vårt apiId).
export async function fetchMatchDetails(apiId: string): Promise<FetchedMatchDetails | null> {
  let res: Response;
  try {
    res = await fetch(`${SUMMARY}?event=${encodeURIComponent(apiId)}`, { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let s: any;
  try {
    s = await res.json();
  } catch {
    return null;
  }

  const comp = s?.header?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  const homeId = home?.team?.id ? String(home.team.id) : undefined;
  const sideOf = (teamId: unknown): "HOME" | "AWAY" =>
    teamId != null && String(teamId) === homeId ? "HOME" : "AWAY";

  const events: any[] = Array.isArray(s?.keyEvents) ? s.keyEvents : [];

  const goals: MatchGoal[] = events
    .filter((e) => e?.scoringPlay)
    .map((e) => {
      const tt = `${e.type?.text ?? ""} ${e.text ?? ""}`.toLowerCase();
      const type = /own goal/.test(tt) ? "OWN" : /penalt/.test(tt) ? "PENALTY" : "REGULAR";
      return {
        side: sideOf(e.team?.id),
        player: e.participants?.[0]?.athlete?.displayName ?? "?",
        minute: parseMinute(e.clock?.displayValue),
        type,
        assist: e.participants?.[1]?.athlete?.displayName ?? null,
      };
    });

  const cards: MatchCard[] = events
    .filter((e) => /card/i.test(e?.type?.text ?? ""))
    .map((e) => {
      const t = (e.type?.text ?? "").toLowerCase();
      const card: MatchCard["card"] = /red/.test(t) ? "RED" : "YELLOW";
      return {
        side: sideOf(e.team?.id),
        player: e.participants?.[0]?.athlete?.displayName ?? "?",
        minute: parseMinute(e.clock?.displayValue),
        card,
      };
    });

  const hShoot = home?.shootoutScore;
  const aShoot = away?.shootoutScore;
  const shootout =
    hShoot != null || aShoot != null ? { home: Number(hShoot ?? 0), away: Number(aShoot ?? 0) } : null;

  return {
    goals,
    cards,
    shootout,
    xg: extractXg(s, homeId, away?.team?.id ? String(away.team.id) : undefined),
    apiHomeName: espnTeamName(home?.team?.abbreviation),
    apiAwayName: espnTeamName(away?.team?.abbreviation),
  };
}

// Hämtar alla VM-matcher (hela turneringsintervallet i ett anrop) från ESPN.
export async function fetchWorldCupMatches(): Promise<ApiMatch[]> {
  const res = await fetch(`${SCOREBOARD}?dates=${TOURNAMENT_RANGE}&limit=400`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN svarade ${res.status}`);
  const data = (await res.json()) as { events?: any[] };

  const out: ApiMatch[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    const state = comp.status?.type?.state;
    const status = state === "post" ? "FINISHED" : state === "in" ? "IN_PLAY" : "SCHEDULED";
    // Ospelade matcher: inga mål (ESPN visar "0" före avspark — undvik 0–0 i DB).
    const live = state === "post" || state === "in";
    const homeScore = live && home.score != null ? parseInt(home.score, 10) : null;
    const awayScore = live && away.score != null ? parseInt(away.score, 10) : null;

    let winner: ApiMatch["winner"] = null;
    if (status === "FINISHED") {
      if (home.winner) winner = "HOME";
      else if (away.winner) winner = "AWAY";
      else if (homeScore != null && awayScore != null && homeScore === awayScore) winner = "DRAW";
    }

    out.push({
      apiId: String(ev.id),
      utcDate: ev.date,
      status,
      homeName: espnTeamName(home.team?.abbreviation),
      awayName: espnTeamName(away.team?.abbreviation),
      homeScore,
      awayScore,
      winner,
    });
  }
  return out;
}
