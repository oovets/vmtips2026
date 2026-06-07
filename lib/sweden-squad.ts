// Läser Sveriges skrapade VM-trupp (data/sweden-squad.json) och beräknar
// UI-färdiga aggregat. Rena funktioner — ingen runtime-skrapning. Datan genereras
// av scripts/scrape-sweden-squad.ts (Wikipedia, "Current squad").

import squadData from "@/data/sweden-squad.json";

export type Position = "GK" | "DF" | "MF" | "FW";

export interface SquadPlayer {
  number: number | null;
  position: Position;
  name: string;
  birthDate: string; // ISO "1998-07-11"
  caps: number;
  goals: number;
  club: string;
  clubNat: string; // landskod för klubben, t.ex. "ENG"
  captain: boolean;
  viceCaptain: boolean;
}

interface SquadFile {
  scrapedAt: string;
  source: string;
  asOf: string;
  players: SquadPlayer[];
}

const DATA = squadData as SquadFile;

export function hasSquadData(): boolean {
  return Array.isArray(DATA.players) && DATA.players.length > 0;
}

export function squadSource(): { source: string; asOf: string; scrapedAt: string } {
  return { source: DATA.source, asOf: DATA.asOf, scrapedAt: DATA.scrapedAt };
}

// Beräknar ålder i hela år utifrån ett referensdatum (default: idag).
function ageFrom(birthISO: string, ref: Date = new Date()): number | null {
  if (!birthISO) return null;
  const b = new Date(birthISO);
  if (Number.isNaN(b.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}

export interface SquadPlayerView extends SquadPlayer {
  age: number | null;
  abroad: boolean; // spelar i utländsk klubb (clubNat !== SWE)
}

const POS_ORDER: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

// Alla spelare med uträknad ålder, sorterade på position (GK→FW) och tröjnummer.
export function squadPlayers(): SquadPlayerView[] {
  return DATA.players
    .map((p) => ({ ...p, age: ageFrom(p.birthDate), abroad: p.clubNat !== "SWE" }))
    .sort((a, b) => {
      const po = POS_ORDER[a.position] - POS_ORDER[b.position];
      if (po !== 0) return po;
      return (a.number ?? 99) - (b.number ?? 99);
    });
}

// Spelare grupperade per position i ordningen GK, DF, MF, FW.
export interface PositionGroup {
  position: Position;
  label: string; // svensk etikett
  players: SquadPlayerView[];
}

const POS_LABEL: Record<Position, string> = {
  GK: "Målvakter",
  DF: "Försvarare",
  MF: "Mittfältare",
  FW: "Anfallare",
};

export function squadByPosition(): PositionGroup[] {
  const players = squadPlayers();
  return (["GK", "DF", "MF", "FW"] as Position[])
    .map((pos) => ({
      position: pos,
      label: POS_LABEL[pos],
      players: players.filter((p) => p.position === pos),
    }))
    .filter((g) => g.players.length > 0);
}

export interface ClubLine {
  club: string;
  clubNat: string;
  count: number;
}

export interface SquadStats {
  size: number;
  avgAge: number | null;
  totalCaps: number;
  totalGoals: number;
  mostCapped: SquadPlayerView | null;
  topScorer: SquadPlayerView | null;
  youngest: SquadPlayerView | null;
  oldest: SquadPlayerView | null;
  captain: SquadPlayerView | null;
  viceCaptain: SquadPlayerView | null;
  positions: { position: Position; label: string; count: number }[];
  abroadCount: number; // spelare i utländska klubbar
  homeCount: number; // spelare i Allsvenskan/svenska klubbar
  leagueCount: number; // antal unika ligor (clubNat)
  topClubs: ClubLine[]; // klubbar med flest spelare (>1)
}

export function squadStats(): SquadStats {
  const players = squadPlayers();
  const size = players.length;

  const withAge = players.filter((p) => p.age != null) as (SquadPlayerView & { age: number })[];
  const avgAge = withAge.length
    ? Math.round((withAge.reduce((s, p) => s + p.age, 0) / withAge.length) * 10) / 10
    : null;

  const totalCaps = players.reduce((s, p) => s + p.caps, 0);
  const totalGoals = players.reduce((s, p) => s + p.goals, 0);

  const mostCapped = players.reduce<SquadPlayerView | null>(
    (best, p) => (best == null || p.caps > best.caps ? p : best),
    null,
  );
  const topScorer = players.reduce<SquadPlayerView | null>(
    (best, p) => (best == null || p.goals > best.goals ? p : best),
    null,
  );
  const youngest = withAge.reduce<SquadPlayerView | null>(
    (y, p) => (y == null || p.age! < y.age! ? p : y),
    null,
  );
  const oldest = withAge.reduce<SquadPlayerView | null>(
    (o, p) => (o == null || p.age! > o.age! ? p : o),
    null,
  );

  const positions = (["GK", "DF", "MF", "FW"] as Position[]).map((pos) => ({
    position: pos,
    label: POS_LABEL[pos],
    count: players.filter((p) => p.position === pos).length,
  }));

  const abroadCount = players.filter((p) => p.abroad).length;
  const homeCount = size - abroadCount;
  const leagueCount = new Set(players.map((p) => p.clubNat).filter(Boolean)).size;

  const clubMap = new Map<string, ClubLine>();
  for (const p of players) {
    const row = clubMap.get(p.club) ?? { club: p.club, clubNat: p.clubNat, count: 0 };
    row.count++;
    clubMap.set(p.club, row);
  }
  const topClubs = [...clubMap.values()]
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count || a.club.localeCompare(b.club, "sv"));

  return {
    size,
    avgAge,
    totalCaps,
    totalGoals,
    mostCapped,
    topScorer,
    youngest,
    oldest,
    captain: players.find((p) => p.captain) ?? null,
    viceCaptain: players.find((p) => p.viceCaptain) ?? null,
    positions,
    abroadCount,
    homeCount,
    leagueCount,
    topClubs,
  };
}
