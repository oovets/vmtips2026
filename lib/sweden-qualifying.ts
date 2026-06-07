// Läser Sveriges skrapade VM-kvalresa (data/sweden-qualifying.json) och beräknar
// chart-/UI-färdiga aggregat. Rena funktioner — ingen runtime-skrapning. Datan
// genereras av scripts/scrape-sweden-qualifying.ts (Wikipedia).

import qualData from "@/data/sweden-qualifying.json";
import type { GoalMinuteSummary, MinuteBucket } from "@/lib/goal-minutes";

export interface SweGoal {
  side: "SWE" | "OPP";
  player: string;
  minute: number;
  stoppage: number;
  penalty: boolean;
  ownGoal: boolean;
}

export interface SweMatch {
  stage: "group" | "playoff";
  date: string;
  swedenHome: boolean;
  opponent: string;
  sweScore: number | null;
  oppScore: number | null;
  result: "W" | "D" | "L" | null;
  venue: string;
  attendance: number | null;
  sentOff: number;
  goals: SweGoal[];
}

interface QualFile {
  scrapedAt: string;
  source: string;
  matches: SweMatch[];
}

const DATA = qualData as QualFile;

export function qualifyingMatches(): SweMatch[] {
  return DATA.matches;
}

// Flagga + namn för kvalmotståndare. Vissa (Kosovo, Slovenien, Ukraina, Polen)
// är inte med i VM 2026 och saknas därför i Team-tabellen — därav denna lookup.
const OPPONENT_INFO: Record<string, { flag: string; name: string }> = {
  SVN: { flag: "🇸🇮", name: "Slovenien" },
  KOS: { flag: "🇽🇰", name: "Kosovo" },
  SUI: { flag: "🇨🇭", name: "Schweiz" },
  UKR: { flag: "🇺🇦", name: "Ukraina" },
  POL: { flag: "🇵🇱", name: "Polen" },
};

export function opponentInfo(code: string): { flag: string; name: string } {
  return OPPONENT_INFO[code] ?? { flag: "🏳️", name: code };
}

export function hasQualifyingData(): boolean {
  return DATA.matches.length > 0;
}

// ── Sammanfattande nyckeltal för hela kvalresan ───────────────────────────────
export interface QualSummary {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  cleanSheets: number; // matcher utan insläppt mål
  failedToScore: number; // matcher utan gjort mål
  avgAttendance: number | null;
  totalAttendance: number;
  biggestWin: SweMatch | null;
  biggestLoss: SweMatch | null;
  // Uppdelat på fas.
  groupPlayed: number;
  groupWins: number;
  groupPoints: number;
  playoffPlayed: number;
  playoffWins: number;
}

export function qualifyingSummary(): QualSummary {
  const ms = DATA.matches;
  const decided = ms.filter((m) => m.sweScore != null && m.oppScore != null);

  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let failedToScore = 0;
  let totalAttendance = 0;
  let attCount = 0;
  let biggestWin: SweMatch | null = null;
  let biggestLoss: SweMatch | null = null;

  for (const m of decided) {
    goalsFor += m.sweScore!;
    goalsAgainst += m.oppScore!;
    if (m.oppScore === 0) cleanSheets++;
    if (m.sweScore === 0) failedToScore++;
    if (m.attendance != null) {
      totalAttendance += m.attendance;
      attCount++;
    }
    const diff = m.sweScore! - m.oppScore!;
    if (m.result === "W" && (!biggestWin || diff > biggestWin.sweScore! - biggestWin.oppScore!)) biggestWin = m;
    if (m.result === "L" && (!biggestLoss || diff < biggestLoss.sweScore! - biggestLoss.oppScore!)) biggestLoss = m;
  }

  const wins = decided.filter((m) => m.result === "W").length;
  const draws = decided.filter((m) => m.result === "D").length;
  const losses = decided.filter((m) => m.result === "L").length;

  const group = decided.filter((m) => m.stage === "group");
  const playoff = decided.filter((m) => m.stage === "playoff");
  const groupWins = group.filter((m) => m.result === "W").length;
  const groupDraws = group.filter((m) => m.result === "D").length;

  return {
    played: decided.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    cleanSheets,
    failedToScore,
    avgAttendance: attCount ? Math.round(totalAttendance / attCount) : null,
    totalAttendance,
    biggestWin,
    biggestLoss,
    groupPlayed: group.length,
    groupWins,
    groupPoints: groupWins * 3 + groupDraws,
    playoffPlayed: playoff.length,
    playoffWins: playoff.filter((m) => m.result === "W").length,
  };
}

// ── Sveriges målskyttar i kvalet (topplista) ─────────────────────────────────
export interface ScorerRow {
  player: string;
  goals: number;
  penalties: number;
}

export function topScorers(): ScorerRow[] {
  const map = new Map<string, ScorerRow>();
  for (const m of DATA.matches) {
    for (const g of m.goals) {
      if (g.side !== "SWE" || g.ownGoal) continue; // egna mål, inte självmål av motståndare
      const row = map.get(g.player) ?? { player: g.player, goals: 0, penalties: 0 };
      row.goals++;
      if (g.penalty) row.penalties++;
      map.set(g.player, row);
    }
  }
  return [...map.values()].sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, "sv"));
}

// ── Målminuter (Sveriges gjorda + insläppta) i samma format som GoalMinuteHeatmap ──
function emptyBuckets(): MinuteBucket[] {
  const out: MinuteBucket[] = [];
  for (let start = 1; start <= 86; start += 5) {
    out.push({ label: `${start}-${start + 4}`, start, end: start + 4, count: 0 });
  }
  out[out.length - 1].end = 90;
  out[out.length - 1].label = "86-90";
  out.push({ label: "90+", start: 91, end: Infinity, count: 0 });
  return out;
}

function bucketIndexFor(minute: number, stoppage: number, buckets: MinuteBucket[]): number {
  const m = minute + (stoppage > 0 ? 0 : 0);
  if (m >= 91 || (stoppage > 0 && minute >= 90)) return buckets.length - 1;
  const mm = Math.max(1, m);
  return Math.min(buckets.length - 2, Math.floor((mm - 1) / 5));
}

function summarize(side: "SWE" | "OPP"): GoalMinuteSummary {
  const buckets = emptyBuckets();
  let total = 0;
  const matchSet = new Set<string>();

  for (const m of DATA.matches) {
    for (const g of m.goals) {
      if (g.side !== side) continue;
      const idx = bucketIndexFor(g.minute, g.stoppage, buckets);
      buckets[idx].count++;
      total++;
      matchSet.add(m.date);
    }
  }

  let max = 0;
  let peak: MinuteBucket | null = null;
  for (const b of buckets) {
    if (b.count > max) max = b.count;
    if (peak == null || b.count > peak.count) peak = b.count > 0 ? b : peak;
  }
  if (peak && peak.count === 0) peak = null;

  return { buckets, total, max, peak, matchesWithMinuteData: matchSet.size };
}

export function goalsScoredMinutes(): GoalMinuteSummary {
  return summarize("SWE");
}
export function goalsConcededMinutes(): GoalMinuteSummary {
  return summarize("OPP");
}

// ── Halvlekssplit: hur fördelar sig Sveriges gjorda/insläppta mål ─────────────
export interface HalfSplit {
  scoredFirst: number;
  scoredSecond: number;
  concededFirst: number;
  concededSecond: number;
}

export function halfSplit(): HalfSplit {
  const out: HalfSplit = { scoredFirst: 0, scoredSecond: 0, concededFirst: 0, concededSecond: 0 };
  for (const m of DATA.matches) {
    for (const g of m.goals) {
      const firstHalf = g.minute <= 45;
      if (g.side === "SWE") {
        if (firstHalf) out.scoredFirst++;
        else out.scoredSecond++;
      } else {
        if (firstHalf) out.concededFirst++;
        else out.concededSecond++;
      }
    }
  }
  return out;
}
