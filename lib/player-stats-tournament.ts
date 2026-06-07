// Aggregerar spelarstatistik HITTILLS i turneringen ur de matchdetaljer vi redan
// sparar (Match.details). Detta är den ENDA spelarnivådata vi har — vi lagrar
// inga truppar/startelvor, så statistiken bygger helt på mål- och korthändelser.
//
// Härledbart per spelare (ur riktiga händelser): mål (totalt + straff/självmål),
// assist (om API:t levererar det), gula/röda kort, händelsernas minuter och vilka
// matcher (motståndare/skede) händelserna inträffade i. INTE härledbart: antal
// landskamper/spelade matcher/speltid, eftersom vi inte lagrar laguppställningar.

import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

// Speglar MatchDetails i lib/football-api.ts (+ `final`-flaggan från sync-service).
interface StoredGoal {
  side: "HOME" | "AWAY";
  player: string;
  minute: number | null;
  type: string | null; // REGULAR | OWN | PENALTY ...
  assist: string | null;
}
interface StoredCard {
  side: "HOME" | "AWAY";
  player: string;
  minute: number | null;
  card: "YELLOW" | "RED" | "YELLOW_RED";
}
interface StoredDetails {
  goals?: StoredGoal[];
  cards?: StoredCard[];
  shootout?: { home: number; away: number } | null;
  final?: boolean;
}

// Svenska skede-etiketter (samma stil som övriga appen).
const STAGE_TITLE: Record<string, string> = {
  GROUP: "Gruppspel",
  R32: "Sextondelar",
  R16: "Åttondelar",
  QF: "Kvartsfinaler",
  SF: "Semifinaler",
  THIRD: "Brons",
  FINAL: "Final",
};

interface TeamTag {
  code: string;
  flag: string;
  name: string;
}

export type PlayerEventKind = "GOAL" | "PENALTY" | "OWN_GOAL" | "ASSIST" | "YELLOW" | "RED" | "YELLOW_RED";

export interface PlayerEvent {
  kind: PlayerEventKind;
  minute: number | null;
  matchNumber: number;
  stage: string;
  stageTitle: string;
  round: string;
  // Spelarens lag och motståndaren i just den matchen.
  team: TeamTag | null;
  opponent: TeamTag | null;
  // För assist-händelser: vem som gjorde målet. För mål: ev. assisterande.
  related: string | null;
}

export interface PlayerStats {
  name: string; // visningsnamn
  team: TeamTag | null; // härlett ur händelsernas sida (vanligast förekommande)
  goals: number; // alla mål spelaren GJORT (exkl. självmål)
  penaltyGoals: number;
  ownGoals: number; // självmål spelaren slagit in
  assists: number;
  yellowCards: number;
  redCards: number; // inkl. gult+gult = rött (YELLOW_RED)
  matchesWithEvents: number; // matcher spelaren förekommer i VÅR händelsedata (ej startelvor)
  events: PlayerEvent[]; // tidslinje, sorterad efter match + minut
}

export interface PlayerSearchHit {
  name: string;
  team: TeamTag | null;
  goals: number;
  cards: number; // gula + röda, för en kompakt etikett i listan
}

interface MatchRow {
  matchNumber: number;
  stage: string;
  round: string;
  details: unknown;
  homeTeam: TeamTag | null;
  awayTeam: TeamTag | null;
}

// Normalisera namn för gruppering (skiftlägesokänsligt + trimmat).
function normKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

interface Agg {
  display: string;
  // Räkna hur ofta varje (lag, visningsnamn) sett för att välja "bästa" representation.
  teamCount: Map<string, { tag: TeamTag; count: number }>;
  nameCount: Map<string, number>;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchNumbers: Set<number>;
  events: PlayerEvent[];
}

function emptyAgg(display: string): Agg {
  return {
    display,
    teamCount: new Map(),
    nameCount: new Map(),
    goals: 0,
    penaltyGoals: 0,
    ownGoals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    matchNumbers: new Set(),
    events: [],
  };
}

function teamKey(t: TeamTag | null): string {
  return t ? t.name : "";
}

function bumpTeam(agg: Agg, t: TeamTag | null) {
  if (!t) return;
  const k = teamKey(t);
  const e = agg.teamCount.get(k) ?? { tag: t, count: 0 };
  e.count++;
  agg.teamCount.set(k, e);
}

function bumpName(agg: Agg, raw: string) {
  const display = raw.trim();
  if (!display) return;
  agg.nameCount.set(display, (agg.nameCount.get(display) ?? 0) + 1);
}

function bestTeam(agg: Agg): TeamTag | null {
  let best: { tag: TeamTag; count: number } | null = null;
  for (const e of agg.teamCount.values()) {
    if (!best || e.count > best.count) best = e;
  }
  return best?.tag ?? null;
}

function bestDisplay(agg: Agg): string {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of agg.nameCount) {
    if (!best || count > best.count) best = { name, count };
  }
  return best?.name ?? agg.display;
}

// Hämtar relevanta matcher och aggregerar per spelarnamn. En körning per anrop;
// datamängden är liten (max 104 matcher) så detta är billigt nog.
async function aggregate(): Promise<Map<string, Agg>> {
  const rows = (await prisma.match.findMany({
    where: { details: { not: Prisma.DbNull }, status: { in: ["LIVE", "FINISHED"] } },
    select: {
      matchNumber: true,
      stage: true,
      round: true,
      details: true,
      homeTeam: { select: { code: true, flag: true, name: true } },
      awayTeam: { select: { code: true, flag: true, name: true } },
    },
    orderBy: { matchNumber: "asc" },
  })) as unknown as MatchRow[];

  const byPlayer = new Map<string, Agg>();
  const get = (raw: string): Agg => {
    const key = normKey(raw);
    let agg = byPlayer.get(key);
    if (!agg) {
      agg = emptyAgg(raw.trim());
      byPlayer.set(key, agg);
    }
    return agg;
  };

  for (const m of rows) {
    const d = (m.details ?? null) as StoredDetails | null;
    if (!d) continue;
    const stageTitle = STAGE_TITLE[m.stage] ?? m.stage;
    const sideTeam = (side: "HOME" | "AWAY"): TeamTag | null =>
      side === "HOME" ? m.homeTeam : m.awayTeam;
    const sideOpp = (side: "HOME" | "AWAY"): TeamTag | null =>
      side === "HOME" ? m.awayTeam : m.homeTeam;

    for (const g of d.goals ?? []) {
      const name = (g.player ?? "").trim();
      if (!name || name === "?") continue;
      const isOwn = g.type === "OWN";
      const isPen = g.type === "PENALTY";
      // För självmål är "side" målets sida (det lag målet räknas FÖR). Spelaren som
      // slog in det tillhör motståndarlaget; spegla därför laget för självmål.
      const scorerSide: "HOME" | "AWAY" = isOwn ? (g.side === "HOME" ? "AWAY" : "HOME") : g.side;
      const team = sideTeam(scorerSide);
      const opponent = sideOpp(scorerSide);

      const agg = get(name);
      bumpName(agg, name);
      bumpTeam(agg, team);
      agg.matchNumbers.add(m.matchNumber);

      if (isOwn) {
        agg.ownGoals++;
        agg.events.push({
          kind: "OWN_GOAL", minute: g.minute, matchNumber: m.matchNumber,
          stage: m.stage, stageTitle, round: m.round, team, opponent, related: null,
        });
      } else {
        agg.goals++;
        if (isPen) agg.penaltyGoals++;
        agg.events.push({
          kind: isPen ? "PENALTY" : "GOAL", minute: g.minute, matchNumber: m.matchNumber,
          stage: m.stage, stageTitle, round: m.round, team, opponent,
          related: g.assist?.trim() || null,
        });
      }

      // Assist (om data finns). Assisteraren tillhör målets lag (ej självmål).
      const assistName = (g.assist ?? "").trim();
      if (assistName && assistName !== "?" && !isOwn) {
        const aTeam = sideTeam(g.side);
        const aOpp = sideOpp(g.side);
        const a = get(assistName);
        bumpName(a, assistName);
        bumpTeam(a, aTeam);
        a.matchNumbers.add(m.matchNumber);
        a.assists++;
        a.events.push({
          kind: "ASSIST", minute: g.minute, matchNumber: m.matchNumber,
          stage: m.stage, stageTitle, round: m.round, team: aTeam, opponent: aOpp,
          related: name,
        });
      }
    }

    for (const c of d.cards ?? []) {
      const name = (c.player ?? "").trim();
      if (!name || name === "?") continue;
      const team = sideTeam(c.side);
      const opponent = sideOpp(c.side);
      const agg = get(name);
      bumpName(agg, name);
      bumpTeam(agg, team);
      agg.matchNumbers.add(m.matchNumber);

      if (c.card === "RED" || c.card === "YELLOW_RED") agg.redCards++;
      else agg.yellowCards++;

      agg.events.push({
        kind: c.card === "RED" ? "RED" : c.card === "YELLOW_RED" ? "YELLOW_RED" : "YELLOW",
        minute: c.minute, matchNumber: m.matchNumber,
        stage: m.stage, stageTitle, round: m.round, team, opponent, related: null,
      });
    }
  }

  return byPlayer;
}

function toStats(agg: Agg): PlayerStats {
  const events = agg.events
    .slice()
    .sort((a, b) => a.matchNumber - b.matchNumber || (a.minute ?? 999) - (b.minute ?? 999));
  return {
    name: bestDisplay(agg),
    team: bestTeam(agg),
    goals: agg.goals,
    penaltyGoals: agg.penaltyGoals,
    ownGoals: agg.ownGoals,
    assists: agg.assists,
    yellowCards: agg.yellowCards,
    redCards: agg.redCards,
    matchesWithEvents: agg.matchNumbers.size,
    events,
  };
}

// Lättviktiga sökträffar för dropdownen. Matchar på delsträng (skiftlägesokänsligt),
// sorterar främst på mål, sedan namn. Returnerar max `limit` träffar.
export async function searchPlayers(query: string, limit = 12): Promise<PlayerSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byPlayer = await aggregate();

  const hits: PlayerSearchHit[] = [];
  for (const agg of byPlayer.values()) {
    const display = bestDisplay(agg);
    if (!display.toLowerCase().includes(q)) continue;
    hits.push({
      name: display,
      team: bestTeam(agg),
      goals: agg.goals,
      cards: agg.yellowCards + agg.redCards,
    });
  }

  hits.sort(
    (a, b) =>
      b.goals - a.goals ||
      b.cards - a.cards ||
      a.name.localeCompare(b.name, "sv"),
  );
  return hits.slice(0, limit);
}

// Full statistik för EN spelare (matchas exakt på normaliserat namn). Returnerar
// null om spelaren saknar händelser i vår data.
export async function playerTournamentStats(name: string): Promise<PlayerStats | null> {
  const key = normKey(name);
  if (!key) return null;
  const byPlayer = await aggregate();
  const agg = byPlayer.get(key);
  if (!agg) return null;
  return toStats(agg);
}
