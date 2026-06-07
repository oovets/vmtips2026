import coachEraData from "@/data/coach-eras.json";
import { qualifyingMatches } from "@/lib/sweden-qualifying";
import { tournaments } from "@/lib/tournament-history";
import type { MatchDetails } from "@/lib/football-api";

export interface CoachEra {
  coach: string;
  from: string;
  to: string | null;
}

export interface CoachMatchGoal {
  side: "FOR" | "AGAINST";
  minute: number | null;
}

export interface CoachMatch {
  teamCode: string;
  date?: string;
  year?: number;
  competition: string;
  stage?: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  goals: CoachMatchGoal[];
}

export interface CoachEraSummary {
  coach: string;
  from: string;
  to: string | null;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  pointsPerMatch: number;
  goalsForPerMatch: number;
  goalsAgainstPerMatch: number;
  winPct: number;
  cleanSheetPct: number;
  lateGoalPct: number;
  competitions: { label: string; matches: number }[];
}

interface CoachEraFile {
  teams: { code: string; eras: CoachEra[] }[];
}

const DATA = coachEraData as CoachEraFile;

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function matchBelongsToEra(match: CoachMatch, era: CoachEra): boolean {
  const fromYear = yearOf(era.from);
  const toYear = era.to ? yearOf(era.to) : 9999;

  if (match.date) {
    return match.date >= era.from && (!era.to || match.date <= era.to);
  }

  if (match.year != null) {
    return match.year >= fromYear && match.year <= toYear;
  }

  return false;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function coachErasForTeam(teamCode: string): CoachEra[] {
  return DATA.teams.find((t) => t.code === teamCode)?.eras ?? [];
}

export function summarizeCoachEras(teamCode: string, matches: CoachMatch[]): CoachEraSummary[] {
  return coachErasForTeam(teamCode)
    .map((era) => {
      const eraMatches = matches.filter((m) => m.teamCode === teamCode && matchBelongsToEra(m, era));
      const goals = eraMatches.flatMap((m) => m.goals);
      const goalsFor = eraMatches.reduce((sum, m) => sum + m.goalsFor, 0);
      const goalsAgainst = eraMatches.reduce((sum, m) => sum + m.goalsAgainst, 0);
      const wins = eraMatches.filter((m) => m.result === "W").length;
      const draws = eraMatches.filter((m) => m.result === "D").length;
      const losses = eraMatches.filter((m) => m.result === "L").length;
      const competitions = new Map<string, number>();

      for (const match of eraMatches) {
        competitions.set(match.competition, (competitions.get(match.competition) ?? 0) + 1);
      }

      const matchesCount = eraMatches.length;
      const lateFor = goals.filter((g) => g.side === "FOR" && g.minute != null && g.minute >= 76).length;
      const allFor = goals.filter((g) => g.side === "FOR").length;

      return {
        coach: era.coach,
        from: era.from,
        to: era.to,
        matches: matchesCount,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDiff: goalsFor - goalsAgainst,
        points: wins * 3 + draws,
        pointsPerMatch: matchesCount ? round2((wins * 3 + draws) / matchesCount) : 0,
        goalsForPerMatch: matchesCount ? round2(goalsFor / matchesCount) : 0,
        goalsAgainstPerMatch: matchesCount ? round2(goalsAgainst / matchesCount) : 0,
        winPct: matchesCount ? Math.round((wins / matchesCount) * 100) : 0,
        cleanSheetPct: matchesCount
          ? Math.round((eraMatches.filter((m) => m.goalsAgainst === 0).length / matchesCount) * 100)
          : 0,
        lateGoalPct: allFor ? Math.round((lateFor / allFor) * 100) : 0,
        competitions: [...competitions.entries()]
          .map(([label, count]) => ({ label, matches: count }))
          .sort((a, b) => b.matches - a.matches || a.label.localeCompare(b.label, "sv")),
      } satisfies CoachEraSummary;
    })
    .filter((summary) => summary.matches > 0)
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function swedenQualifyingCoachMatches(): CoachMatch[] {
  return qualifyingMatches()
    .filter((m) => m.sweScore != null && m.oppScore != null && m.result != null)
    .map((m) => ({
      teamCode: "SWE",
      date: m.date,
      competition: "VM-kval 2026",
      stage: m.stage === "playoff" ? "Playoff" : "Gruppspel",
      opponent: m.opponent,
      goalsFor: m.sweScore!,
      goalsAgainst: m.oppScore!,
      result: m.result!,
      goals: m.goals.map((g) => ({ side: g.side === "SWE" ? "FOR" : "AGAINST", minute: g.minute })),
    }));
}

export function swedenHistoricalCoachMatches(): CoachMatch[] {
  const out: CoachMatch[] = [];

  for (const tournament of tournaments()) {
    for (const match of tournament.matches) {
      if (match.team1 !== "SWE" && match.team2 !== "SWE") continue;
      if (match.score1 == null || match.score2 == null) continue;

      const swedenIsTeam1 = match.team1 === "SWE";
      const goalsFor = swedenIsTeam1 ? match.score1 : match.score2;
      const goalsAgainst = swedenIsTeam1 ? match.score2 : match.score1;
      out.push({
        teamCode: "SWE",
        year: tournament.year,
        competition: tournament.label,
        stage: match.stage === "knockout" ? "Slutspel" : "Gruppspel",
        opponent: swedenIsTeam1 ? match.team2 : match.team1,
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
        goals: match.goals.map((goal) => ({
          side: goal.team === (swedenIsTeam1 ? 1 : 2) ? "FOR" : "AGAINST",
          minute: goal.minute,
        })),
      });
    }
  }

  return out;
}

export function swedenDbCoachMatches(
  matches: {
    kickoff: Date;
    stage: string;
    groupId: string | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { code: string } | null;
    awayTeam: { code: string } | null;
    details: unknown;
  }[],
  swedenTeamId: string,
): CoachMatch[] {
  return matches
    .filter((m) => m.homeScore != null && m.awayScore != null && (m.homeTeamId === swedenTeamId || m.awayTeamId === swedenTeamId))
    .map((m) => {
      const swedenHome = m.homeTeamId === swedenTeamId;
      const goalsFor = swedenHome ? m.homeScore! : m.awayScore!;
      const goalsAgainst = swedenHome ? m.awayScore! : m.homeScore!;
      const details = (m.details as MatchDetails | null) ?? null;
      const goals = details?.goals?.map((goal) => {
        const forSweden = goal.side === (swedenHome ? "HOME" : "AWAY");
        return { side: forSweden ? "FOR" as const : "AGAINST" as const, minute: goal.minute };
      }) ?? [];

      return {
        teamCode: "SWE",
        date: m.kickoff.toISOString().slice(0, 10),
        competition: "VM 2026",
        stage: m.stage === "GROUP" ? `Grupp ${m.groupId ?? ""}`.trim() : m.stage,
        opponent: swedenHome ? (m.awayTeam?.code ?? "?") : (m.homeTeam?.code ?? "?"),
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
        goals,
      };
    });
}

export function swedenCoachEraSummaries(
  currentWorldCupMatches: Parameters<typeof swedenDbCoachMatches>[0],
  swedenTeamId: string,
): CoachEraSummary[] {
  return summarizeCoachEras("SWE", [
    ...swedenHistoricalCoachMatches(),
    ...swedenQualifyingCoachMatches(),
    ...swedenDbCoachMatches(currentWorldCupMatches, swedenTeamId),
  ]);
}
