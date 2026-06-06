import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/lock";
import { BRACKET, BRACKET_BY_NUMBER } from "@/lib/bracket-template";
import { computeDerivedStats, favoriteTeamId } from "@/lib/player-stats";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKL".split("");
const STAGE_TITLE: Record<string, string> = {
  R32: "Sextondelar", R16: "Åttondelar", QF: "Kvartsfinaler", SF: "Semifinaler", THIRD: "Brons", FINAL: "Final",
};

// Detaljerad spelarstatistik för topplistans inline-panel.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      score: true,
      league: true,
      bracketPredictions: { orderBy: { matchNumber: "asc" } },
      groupPredictions: true,
      matchPredictions: { include: { match: { select: { matchNumber: true } } } },
    },
  });
  if (!target || target.leagueId !== me.leagueId) {
    return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
  }

  const reveal = isLocked() || target.id === me.id;
  const total = target.score?.total ?? 0;
  const submitted = target.submitted;

  if (!reveal) {
    return NextResponse.json({
      id: target.id,
      displayName: target.displayName,
      submitted,
      isMe: target.id === me.id,
      reveal: false,
      total,
    });
  }

  const tippingMode = target.league.tippingMode as "EXACT" | "X12";

  const [teams, groupMatches] = await Promise.all([
    prisma.team.findMany({ select: { id: true, code: true, flag: true, name: true, fifaRank: true } }),
    prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { matchNumber: true, groupId: true, homeTeamId: true, awayTeamId: true },
      orderBy: { matchNumber: "asc" },
    }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const label = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? { code: t.code, flag: t.flag } : null;
  };

  // Tips per matchnummer.
  const matchPreds = target.matchPredictions.map((p) => ({
    matchNumber: p.match.matchNumber,
    predHome: p.predHome,
    predAway: p.predAway,
    predOutcome: p.predOutcome,
  }));
  const predByNum = new Map(matchPreds.map((p) => [p.matchNumber, p]));
  const predText = (n: number): string => {
    const p = predByNum.get(n);
    if (!p) return "–";
    if (tippingMode === "X12") return p.predOutcome ?? "–";
    return p.predHome != null && p.predAway != null ? `${p.predHome}–${p.predAway}` : "–";
  };

  const groupPreds = target.groupPredictions.map((g) => ({
    groupId: g.groupId,
    rank1TeamId: g.rank1TeamId,
    rank2TeamId: g.rank2TeamId,
    rank3TeamId: g.rank3TeamId,
    rank4TeamId: g.rank4TeamId,
  }));
  const bracketPreds = target.bracketPredictions.map((b) => ({
    matchNumber: b.matchNumber,
    team1Id: b.team1Id,
    team2Id: b.team2Id,
    winnerTeamId: b.winnerTeamId,
  }));
  const bracketByNum = new Map(bracketPreds.map((b) => [b.matchNumber, b]));

  const derived = computeDerivedStats(tippingMode, matchPreds, groupPreds, bracketPreds);

  // Slutspelsprofil.
  const champId = bracketByNum.get(104)?.winnerTeamId ?? null;
  const finalists = [101, 102].map((n) => bracketByNum.get(n)?.winnerTeamId).filter(Boolean) as string[];
  const semifinalists = [97, 98, 99, 100]
    .map((n) => bracketByNum.get(n)?.winnerTeamId)
    .filter(Boolean) as string[];

  const fav = favoriteTeamId(bracketPreds);

  // Hur populärt spelarens mästartips är i ligan (boldness).
  let championSharePct: number | null = null;
  if (champId) {
    const leagueChamps = await prisma.bracketPrediction.findMany({
      where: { matchNumber: 104, winnerTeamId: { not: null }, user: { leagueId: me.leagueId } },
      select: { winnerTeamId: true },
    });
    const totalChamps = leagueChamps.length;
    const same = leagueChamps.filter((c) => c.winnerTeamId === champId).length;
    championSharePct = totalChamps ? Math.round((same / totalChamps) * 100) : null;
  }

  // Träffsäkerhet hittills (avgjorda gruppmatcher som tippats).
  const finished = await prisma.match.findMany({
    where: { stage: "GROUP", status: "FINISHED", homeScore: { not: null }, awayScore: { not: null } },
    select: { matchNumber: true },
  });
  const playedTipped = finished.filter((m) => {
    const p = predByNum.get(m.matchNumber);
    return p && (tippingMode === "X12" ? p.predOutcome != null : p.predHome != null && p.predAway != null);
  }).length;

  const b = (target.score?.breakdown as Record<string, number> | undefined) ?? {};
  const exactCount = b.exactCount ?? 0;
  const correctOutcomeCount = b.correctOutcomeCount ?? 0;
  const accuracyPct = playedTipped ? Math.round((correctOutcomeCount / playedTipped) * 100) : null;

  // Gruppdetaljer (rankning + matchtips).
  const groupPredByLetter = new Map(groupPreds.map((g) => [g.groupId, g]));
  const matchesByGroup: Record<string, typeof groupMatches> = {};
  for (const m of groupMatches) (matchesByGroup[m.groupId!] ??= []).push(m);
  const groups = LETTERS.map((letter) => {
    const gp = groupPredByLetter.get(letter);
    const ranking = gp
      ? [gp.rank1TeamId, gp.rank2TeamId, gp.rank3TeamId, gp.rank4TeamId].map(label)
      : [];
    const matches = (matchesByGroup[letter] ?? []).map((m) => ({
      home: label(m.homeTeamId),
      away: label(m.awayTeamId),
      pred: predText(m.matchNumber),
    }));
    return { letter, ranking, matches };
  });

  // Slutspelsträd (spelarens tippade lag eller slot-etikett).
  const bracket = BRACKET.map((slot) => {
    const p = bracketByNum.get(slot.matchNumber);
    const side = (which: "team1" | "team2") => {
      const teamId = which === "team1" ? p?.team1Id : p?.team2Id;
      const t = teamId ? teamById.get(teamId) : null;
      if (t) return { label: `${t.flag} ${t.code}`, muted: false, win: p?.winnerTeamId === teamId };
      const tmpl = BRACKET_BY_NUMBER[slot.matchNumber];
      return { label: which === "team1" ? tmpl.home : tmpl.away, muted: true, win: false };
    };
    return {
      matchNumber: slot.matchNumber,
      stage: slot.stage,
      stageTitle: STAGE_TITLE[slot.stage] ?? slot.stage,
      team1: side("team1"),
      team2: side("team2"),
    };
  });

  return NextResponse.json({
    id: target.id,
    displayName: target.displayName,
    submitted,
    isMe: target.id === me.id,
    reveal: true,
    total,
    breakdown: {
      groupMatches: b.groupMatches ?? 0,
      advancement: b.advancement ?? 0,
      knockout: b.knockout ?? 0,
      champion: b.champion ?? 0,
    },
    stats: {
      ...derived,
      exactCount,
      correctOutcomeCount,
      playedTipped,
      accuracyPct,
      championSharePct,
      favoriteTeam: fav ? { team: label(fav.teamId), count: fav.count } : null,
    },
    champion: label(champId),
    finalists: finalists.map(label),
    semifinalists: semifinalists.map(label),
    groups,
    bracket,
  });
}
