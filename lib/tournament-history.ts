// Läser den skrapade historiska mästerskapsdatan (data/tournament-history.json)
// och beräknar chart-färdiga aggregat. Datan genereras av scripts/scrape-history.ts
// (Wikipedia). Rena funktioner — ingen runtime-skrapning.

import historyData from "@/data/tournament-history.json";

export interface HistGoal {
  team: 1 | 2;
  player: string;
  minute: number;
  stoppage: number;
  penalty: boolean;
  ownGoal: boolean;
}

export interface HistMatch {
  stage: "group" | "knockout";
  team1: string;
  team2: string;
  score1: number | null;
  score2: number | null;
  attendance: number | null;
  goals: HistGoal[];
  sentOff: number;
  shootout: [number, number] | null;
}

export interface HistTournament {
  id: string;
  label: string;
  year: number;
  matches: HistMatch[];
}

interface HistoryFile {
  scrapedAt: string;
  source: string;
  tournaments: HistTournament[];
}

const DATA = historyData as HistoryFile;

export function tournaments(): HistTournament[] {
  return DATA.tournaments;
}

// ── Målminuter i 10-minutersintervall (för stacked/grupperad bar chart) ───────
// 9 intervall: 1-10, 11-20, ... 81-90, plus "90+" för tilläggstid/övertid.
export interface MinuteBuckets {
  labels: string[]; // ["1-10", ..., "81-90", "90+"]
  series: { tournament: string; counts: number[] }[];
}

const BUCKET_LABELS = ["1-10", "11-20", "21-30", "31-40", "41-50", "51-60", "61-70", "71-80", "81-90", "90+"];

function bucketIndex(minute: number, stoppage: number): number {
  if (stoppage > 0 && (minute === 45 || minute === 90 || minute === 120 || minute === 105)) {
    // Tilläggstid i halvlek: lägg i sista relevanta band (45+ -> 41-50, 90+ -> 90+).
    if (minute >= 90) return BUCKET_LABELS.length - 1;
  }
  if (minute >= 91) return BUCKET_LABELS.length - 1; // övertid
  return Math.min(BUCKET_LABELS.length - 2, Math.floor((Math.max(1, minute) - 1) / 10));
}

export function goalsByMinuteBucket(): MinuteBuckets {
  return {
    labels: BUCKET_LABELS,
    series: DATA.tournaments.map((t) => {
      const counts = new Array(BUCKET_LABELS.length).fill(0);
      for (const m of t.matches) {
        for (const g of m.goals) counts[bucketIndex(g.minute, g.stoppage)]++;
      }
      return { tournament: t.label, counts };
    }),
  };
}

// ── Nyckeltal per mästerskap (för jämförelse-staplar) ─────────────────────────
export interface TournamentStat {
  tournament: string;
  year: number;
  matches: number;
  goals: number;
  goalsPerMatch: number;
  penalties: number;
  ownGoals: number;
  firstHalfPct: number; // andel mål i 1:a halvlek (<=45)
  lateGoalsPct: number; // andel mål från 76:e minuten och framåt
  avgAttendance: number | null;
  redCards: number;
}

export function tournamentStats(): TournamentStat[] {
  return DATA.tournaments.map((t) => {
    const goals = t.matches.flatMap((m) => m.goals);
    const total = goals.length;
    const firstHalf = goals.filter((g) => g.minute <= 45).length;
    const late = goals.filter((g) => g.minute >= 76).length;
    const att = t.matches.map((m) => m.attendance).filter((a): a is number => a != null);
    return {
      tournament: t.label,
      year: t.year,
      matches: t.matches.length,
      goals: total,
      goalsPerMatch: t.matches.length ? Math.round((total / t.matches.length) * 100) / 100 : 0,
      penalties: goals.filter((g) => g.penalty).length,
      ownGoals: goals.filter((g) => g.ownGoal).length,
      firstHalfPct: total ? Math.round((firstHalf / total) * 100) : 0,
      lateGoalsPct: total ? Math.round((late / total) * 100) : 0,
      avgAttendance: att.length ? Math.round(att.reduce((s, a) => s + a, 0) / att.length) : null,
      redCards: t.matches.reduce((s, m) => s + m.sentOff, 0),
    };
  });
}

// ── Fördelning av antal mål per match (0, 1, 2, ... per match) ────────────────
export interface GoalsPerMatchDist {
  labels: string[]; // ["0", "1", ... "6+"]
  series: { tournament: string; counts: number[] }[];
}

export function goalsPerMatchDistribution(): GoalsPerMatchDist {
  const labels = ["0", "1", "2", "3", "4", "5", "6+"];
  return {
    labels,
    series: DATA.tournaments.map((t) => {
      const counts = new Array(labels.length).fill(0);
      for (const m of t.matches) {
        const g = (m.score1 ?? 0) + (m.score2 ?? 0);
        counts[Math.min(labels.length - 1, g)]++;
      }
      return { tournament: t.label, counts };
    }),
  };
}

// ── Utökade nyckeltal: dramatik, comebacks, straffläggningar, torra/målrika ───
export interface DramaStat {
  tournament: string;
  year: number;
  matches: number;
  // Comebacks: matcher där laget som först låg under ändå inte förlorade (vände
  // till vinst eller kvitterade). Kräver kronologisk målordning (vi har minuter).
  comebacks: number;
  comebackPct: number;
  // Sen dramatik: matcher med minst ett mål från 85:e minuten och framåt.
  lateDramaMatches: number;
  lateDramaPct: number;
  // Straffläggningar i slutspel.
  shootouts: number;
  // Torra (0-0) respektive målrika (5+ mål) matcher.
  goalless: number;
  goallessPct: number;
  highScoring: number; // 5+ mål totalt
  highScoringPct: number;
}

// Avgör om en match innehöll en comeback för något lag: gå igenom målen i
// kronologisk ordning, håll löpande ställning, och flagga om ett lag någon gång
// låg under men slutresultatet inte blev en förlust för det laget.
function matchHadComeback(m: HistMatch): boolean {
  const ordered = [...m.goals].sort((a, b) => a.minute - b.minute || a.stoppage - b.stoppage);
  let s1 = 0;
  let s2 = 0;
  let team1WasBehind = false;
  let team2WasBehind = false;
  for (const g of ordered) {
    // Ett mål av "team" räknas till det lagets ställning (självmål gynnar motståndaren).
    const benefits: 1 | 2 = g.ownGoal ? (g.team === 1 ? 2 : 1) : g.team;
    if (benefits === 1) s1++;
    else s2++;
    if (s1 < s2) team1WasBehind = true;
    if (s2 < s1) team2WasBehind = true;
  }
  const f1 = m.score1 ?? s1;
  const f2 = m.score2 ?? s2;
  // Comeback = ett lag låg under men förlorade inte.
  if (team1WasBehind && f1 >= f2) return true;
  if (team2WasBehind && f2 >= f1) return true;
  return false;
}

export function dramaStats(): DramaStat[] {
  return DATA.tournaments.map((t) => {
    const ms = t.matches;
    const total = ms.length || 1;
    const comebacks = ms.filter(matchHadComeback).length;
    const lateDrama = ms.filter((m) => m.goals.some((g) => g.minute >= 85)).length;
    const shootouts = ms.filter((m) => m.shootout != null).length;
    const goalless = ms.filter((m) => (m.score1 ?? 0) + (m.score2 ?? 0) === 0).length;
    const highScoring = ms.filter((m) => (m.score1 ?? 0) + (m.score2 ?? 0) >= 5).length;
    return {
      tournament: t.label,
      year: t.year,
      matches: ms.length,
      comebacks,
      comebackPct: Math.round((comebacks / total) * 100),
      lateDramaMatches: lateDrama,
      lateDramaPct: Math.round((lateDrama / total) * 100),
      shootouts,
      goalless,
      goallessPct: Math.round((goalless / total) * 100),
      highScoring,
      highScoringPct: Math.round((highScoring / total) * 100),
    };
  });
}

// ── Mest produktiva målskyttar per turnering (exkl. självmål) ─────────────────
export interface TopScorerRow {
  player: string;
  goals: number;
}
export interface TournamentScorers {
  tournament: string;
  year: number;
  scorers: TopScorerRow[]; // topp-N sorterat på antal mål
}

// ── Ett specifikt lags historiska VM-statistik (för Sverige-fliken) ───────────
export interface TeamHistEntry {
  tournament: string;
  year: number;
  matches: number;
  goalsFor: number;
  goalsAgainst: number;
  topScorers: TopScorerRow[]; // lagets egna målskyttar i turneringen
}

// Plockar ut ett lags (kod, t.ex. "SWE") matcher per turnering och summerar
// mål för/emot samt lagets målskyttar.
export function teamHistory(code: string): TeamHistEntry[] {
  const out: TeamHistEntry[] = [];
  for (const t of DATA.tournaments) {
    const played = t.matches.filter((m) => m.team1 === code || m.team2 === code);
    if (played.length === 0) continue;

    let goalsFor = 0;
    let goalsAgainst = 0;
    const scorers = new Map<string, number>();

    for (const m of played) {
      const isTeam1 = m.team1 === code;
      goalsFor += (isTeam1 ? m.score1 : m.score2) ?? 0;
      goalsAgainst += (isTeam1 ? m.score2 : m.score1) ?? 0;
      for (const g of m.goals) {
        // Mål gjort AV laget (ej självmål, och rätt sida). Självmål av motståndaren
        // räknas i score men har ingen av lagets spelare som skytt.
        const scoredByTeam = g.team === (isTeam1 ? 1 : 2) && !g.ownGoal;
        if (!scoredByTeam) continue;
        const name = (g.player ?? "").trim();
        if (!name || name === "?") continue;
        scorers.set(name, (scorers.get(name) ?? 0) + 1);
      }
    }

    out.push({
      tournament: t.label,
      year: t.year,
      matches: played.length,
      goalsFor,
      goalsAgainst,
      topScorers: [...scorers.entries()]
        .map(([player, goals]) => ({ player, goals }))
        .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, "sv"))
        .slice(0, 5),
    });
  }
  return out.sort((a, b) => b.year - a.year);
}

export function topScorersByTournament(limit = 5): TournamentScorers[] {
  return DATA.tournaments.map((t) => {
    const map = new Map<string, number>();
    for (const m of t.matches) {
      for (const g of m.goals) {
        if (g.ownGoal) continue;
        const name = (g.player ?? "").trim();
        if (!name || name === "?") continue;
        map.set(name, (map.get(name) ?? 0) + 1);
      }
    }
    const scorers = [...map.entries()]
      .map(([player, goals]) => ({ player, goals }))
      .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, "sv"))
      .slice(0, limit);
    return { tournament: t.label, year: t.year, scorers };
  });
}
