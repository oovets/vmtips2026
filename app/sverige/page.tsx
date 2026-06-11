// Sverige-fliken: allt om landslaget samlat på ett ställe. Live-hero när Sverige
// spelar, vägen till VM (form + gruppmatcher), grupp F-tabell, prognoser
// (marknad vs liga) och möjlig slutspelsväg. Server-renderad, all extern data
// (ESPN) har tyst fallback så sidan aldrig kraschar.

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeAllStandings, type ResultRef, type TeamRef } from "@/lib/standings";
import { marketOdds, marketPct } from "@/lib/odds";
import { fetchEspnMatches, lookupEspn, type EspnMatch } from "@/lib/espn";
import { broadcasterFor, broadcasterLogo } from "@/lib/broadcast";
import type { FormEntry, MatchDetails } from "@/lib/football-api";
import { BRACKET } from "@/lib/bracket-template";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { SectionHeading } from "@/components/SectionHeading";
import { PageHeading } from "@/components/PageHeading";
import { OddsBar } from "@/components/OddsBar";
import { GoalMinuteHeatmap } from "@/components/GoalMinuteHeatmap";
import { computeGoalMinutes } from "@/lib/goal-minutes";
import {
  qualifyingMatches,
  hasQualifyingData,
  qualifyingSummary,
  topScorers,
  goalsScoredMinutes,
  goalsConcededMinutes,
  halfSplit,
  opponentInfo,
} from "@/lib/sweden-qualifying";
import { teamHistory } from "@/lib/tournament-history";
import { hasSquadData, squadStats, squadByPosition, squadSource } from "@/lib/sweden-squad";
import { swedenCoachEraSummaries, type CoachEraSummary } from "@/lib/coach-analytics";

export const dynamic = "force-dynamic";

const SWEDEN_CODE = "SWE";
const SWEDEN_GROUP = "F";
const CHAMPION_MATCH = 104;

function dateKey(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}
function timeStr(d: Date): string {
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
}

function matchStatusLabel(m: { status: string }, live: EspnMatch | null, scoreText: string | null) {
  if (scoreText) {
    return { text: scoreText, className: "bg-white/10 text-slate-100" };
  }
  if (live?.state === "in") {
    return { text: live.clock ?? "Live", className: "bg-red-500/20 text-red-200" };
  }
  if (m.status === "LIVE") {
    return { text: "Live", className: "bg-red-500/20 text-red-200" };
  }
  if (m.status === "FINISHED" || live?.state === "post") {
    return { text: "Slut", className: "bg-white/10 text-slate-300" };
  }
  return { text: "Kommande", className: "bg-pitch-500/15 text-pitch-100" };
}

export default async function SverigePage() {
  const user = await getCurrentUser();

  // Sverige-sidan är publik. Inloggade ser sin egen liga; utloggade ser den
  // äldsta ligan som publik vy (riktiga ligaprognoser, men inget eget "Ditt tips").
  const scopeLeague = user
    ? { id: user.leagueId, tippingMode: user.league.tippingMode as "EXACT" | "X12" }
    : await prisma.league.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, tippingMode: true },
      });
  const scopeLeagueId = scopeLeague?.id ?? null;
  const tippingMode = (scopeLeague?.tippingMode as "EXACT" | "X12" | undefined) ?? "EXACT";

  const teams = await prisma.team.findMany();
  const sweden = teams.find((t) => t.code === SWEDEN_CODE);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const tag = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? `${t.flag} ${t.code}` : "—";
  };

  if (!sweden) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">🇸🇪 Sverige</h1>
        </div>
      </div>
    );
  }

  // ── Sveriges matcher + alla avgjorda gruppmatcher (för tabellen) ──────────────
  const [swedishMatches, finishedGroup] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ homeTeamId: sweden.id }, { awayTeamId: sweden.id }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoff: "asc" },
    }),
    prisma.match.findMany({
      where: { stage: "GROUP", status: "FINISHED" },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  // ── Grupp F-tabell ────────────────────────────────────────────────────────────
  const teamsByGroup: Record<string, TeamRef[]> = {};
  for (const t of teams) (teamsByGroup[t.groupId] ??= []).push({ id: t.id, groupId: t.groupId, fifaRank: t.fifaRank });
  const results: ResultRef[] = finishedGroup
    .filter((m) => m.homeTeamId && m.awayTeamId && m.homeScore != null && m.awayScore != null)
    .map((m) => ({ homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId!, homeScore: m.homeScore!, awayScore: m.awayScore! }));
  const standings = computeAllStandings(teamsByGroup, results);
  const groupF = standings[SWEDEN_GROUP] ?? [];
  const swedenStanding = groupF.find((s) => s.teamId === sweden.id);

  // ── ESPN live + odds för Sveriges matcher ─────────────────────────────────────
  const espn = await fetchEspnMatches(swedishMatches.map((m) => m.kickoff));
  const espnFor = (m: (typeof swedishMatches)[number]): EspnMatch | null =>
    m.homeTeam && m.awayTeam ? lookupEspn(espn, m.homeTeam.code, m.awayTeam.code) : null;

  // Pågående Sverige-match (driver live-hero).
  const liveMatch = swedishMatches.find((m) => espnFor(m)?.state === "in") ?? null;
  const liveEspn = liveMatch ? espnFor(liveMatch) : null;
  const liveDetails = (liveMatch?.details as unknown as MatchDetails | null) ?? null;

  // ── Form (5 senaste) ─────────────────────────────────────────────────────────
  const form = (sweden.recentForm as unknown as FormEntry[]).slice(0, 5);

  // ── Sveriges målminuter (gjorda + insläppta) per 5-minutersintervall ─────────
  const swedishMatchGoals = swedishMatches.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    status: m.status,
    details: m.details,
  }));
  const goalsScored = computeGoalMinutes(swedishMatchGoals, { filterTeamId: sweden.id, perspective: "scored" });
  const goalsConceded = computeGoalMinutes(swedishMatchGoals, { filterTeamId: sweden.id, perspective: "conceded" });

  // ── VM-kvalresan 2025-26 (skrapad Wikipedia-data) ────────────────────────────
  const qual = hasQualifyingData();
  const qualMatches = qual ? qualifyingMatches() : [];
  const qualSummary = qual ? qualifyingSummary() : null;
  const qualScorers = qual ? topScorers() : [];
  const qualScored = qual ? goalsScoredMinutes() : null;
  const qualConceded = qual ? goalsConcededMinutes() : null;
  const qualHalves = qual ? halfSplit() : null;

  // ── Sveriges historiska VM (skrapad turneringshistorik) ──────────────────────
  const sweWcHistory = teamHistory(SWEDEN_CODE);

  // ── VM-truppen 2026 (skrapad Wikipedia-data) ─────────────────────────────────
  const hasSquad = hasSquadData();
  const squad = hasSquad ? squadStats() : null;
  const squadGroups = hasSquad ? squadByPosition() : [];
  const squadMeta = hasSquad ? squadSource() : null;
  const coachEras = swedenCoachEraSummaries(swedishMatches, sweden.id);
  const coachMaxPoints = Math.max(0, ...coachEras.map((e) => e.pointsPerMatch));
  const coachMaxGoals = Math.max(0, ...coachEras.map((e) => e.goalsForPerMatch));

  // ── Nästa avspark (schemalagd Sverige-match) ─────────────────────────────────
  const now = new Date();
  const nextMatch = swedishMatches.find((m) => m.status === "SCHEDULED" && m.kickoff > now) ?? null;

  // ── VM 2026 hittills: Sveriges faktiska turneringsstatistik ──────────────────
  // Bygger enbart på Sveriges riktiga VM-matcher i databasen (prisma.match =
  // VM-turneringen 2026, matchnummer 1–104). Kvaldata (lib/sweden-qualifying) och
  // historik (lib/tournament-history) hålls medvetet utanför. Räknar alla avgjorda
  // matcher (grupp + ev. slutspel) plus pågående live-match, så siffrorna är
  // turneringsövergripande. Gruppplaceringen tas från den beräknade grupp F-tabellen.
  const wcPlayed = swedishMatches.filter(
    (m) => (m.status === "FINISHED" || m.status === "LIVE") && m.homeTeamId && m.awayTeamId,
  );
  const wcFinished = wcPlayed.filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null);
  const hasWcData = wcPlayed.length > 0;

  // Sveriges perspektiv per avgjord match (gjorda/insläppta mål, resultat).
  const wcMatchView = (m: (typeof swedishMatches)[number]) => {
    const sweHome = m.homeTeamId === sweden.id;
    const live = espnFor(m);
    const useLive = m.status === "LIVE" && live && live.state !== "pre";
    const hs = useLive ? live.homeScore : m.homeScore;
    const as = useLive ? live.awayScore : m.awayScore;
    const sweScore = sweHome ? hs : as;
    const oppScore = sweHome ? as : hs;
    const opp = sweHome ? m.awayTeam : m.homeTeam;
    const result: "W" | "D" | "L" | null =
      sweScore == null || oppScore == null ? null : sweScore > oppScore ? "W" : sweScore === oppScore ? "D" : "L";
    return { sweHome, sweScore, oppScore, opp, result, isLive: m.status === "LIVE" };
  };

  // Aggregerad VM-statistik (endast färdigspelade matcher räknas i W/D/L och mål).
  const wcAgg = wcFinished.reduce(
    (a, m) => {
      const v = wcMatchView(m);
      if (v.result === "W") a.wins++;
      else if (v.result === "D") a.draws++;
      else if (v.result === "L") a.losses++;
      a.gf += v.sweScore ?? 0;
      a.ga += v.oppScore ?? 0;
      return a;
    },
    { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 },
  );
  const wcGoalDiff = wcAgg.gf - wcAgg.ga;

  // Senaste avgjorda VM-matchen (för "Senaste matchen").
  const lastWcMatch = [...wcFinished].sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime())[0] ?? null;
  const swedenRank = swedenStanding ? groupF.findIndex((s) => s.teamId === sweden.id) + 1 : 0;

  // ── Ligans tips om Sverige ────────────────────────────────────────────────────
  const leagueUserIds = scopeLeagueId
    ? (await prisma.user.findMany({ where: { leagueId: scopeLeagueId }, select: { id: true } })).map((u) => u.id)
    : [];
  const leagueSize = leagueUserIds.length;

  const [championPreds, groupFPreds, myMatchPreds] = await Promise.all([
    scopeLeagueId
      ? prisma.bracketPrediction.findMany({
          where: { matchNumber: CHAMPION_MATCH, winnerTeamId: sweden.id, user: { leagueId: scopeLeagueId } },
          select: { userId: true },
        })
      : [],
    leagueUserIds.length
      ? prisma.groupPrediction.findMany({
          where: { groupId: SWEDEN_GROUP, userId: { in: leagueUserIds } },
          select: { rank1TeamId: true, rank2TeamId: true },
        })
      : [],
    // "Ditt tips" finns bara för inloggade.
    user
      ? prisma.matchPrediction.findMany({
          where: { userId: user.id, matchId: { in: swedishMatches.map((m) => m.id) } },
          include: { match: { select: { id: true } } },
        })
      : [],
  ]);

  const championCount = championPreds.length;
  const groupWinnerCount = groupFPreds.filter((g) => g.rank1TeamId === sweden.id).length;
  const advanceCount = groupFPreds.filter((g) => g.rank1TeamId === sweden.id || g.rank2TeamId === sweden.id).length;
  const myPredByMatch = new Map(myMatchPreds.map((p) => [p.match.id, p]));
  const myPredText = (matchId: string): string => {
    const p = myPredByMatch.get(matchId);
    if (!p) return "–";
    if (tippingMode === "X12") return p.predOutcome ?? "–";
    return p.predHome != null && p.predAway != null ? `${p.predHome}–${p.predAway}` : "–";
  };
  const pctOfLeague = (n: number) => (leagueSize ? Math.round((n / leagueSize) * 100) : 0);

  // ── Möjlig slutspelsväg (R32-slottar där Sverige kan hamna) ──────────────────
  // En grupp F-trea kan hamna i flera olika R32-matcher (3...F...-slottar), medan
  // ettan/tvåan har exakt en match var. Dela upp så det blir logiskt.
  const r32Slots = BRACKET.filter((s) => s.stage === "R32");
  const slotIsSweden = (slot: string, pos: "1" | "2" | "3") =>
    pos === "3" ? slot.startsWith("3") && slot.includes(SWEDEN_GROUP) : slot === `${pos}${SWEDEN_GROUP}`;
  const koAsWinner =
    r32Slots.find((s) => slotIsSweden(s.home, "1") || slotIsSweden(s.away, "1")) ?? null;
  const koAsRunnerUp =
    r32Slots.find((s) => slotIsSweden(s.home, "2") || slotIsSweden(s.away, "2")) ?? null;
  const koAsThird = r32Slots.filter((s) => slotIsSweden(s.home, "3") || slotIsSweden(s.away, "3"));

  // ── Sverige vs VM-gruppmotståndet (grupp F, exkl. Sverige) ───────────────────
  const groupFTeams = teams.filter((t) => t.groupId === SWEDEN_GROUP);
  const formPts = (f: FormEntry[]) => f.reduce((a, r) => a + (r.result === "W" ? 3 : r.result === "D" ? 1 : 0), 0);
  const groupFCompare = groupFTeams
    .map((t) => {
      const form = (t.recentForm as unknown as FormEntry[]).slice(0, 5);
      return {
        id: t.id,
        code: t.code,
        flag: t.flag,
        name: t.name,
        fifaRank: t.fifaRank,
        form,
        formPts: form.length ? formPts(form) : 0,
        isSweden: t.id === sweden.id,
      };
    })
    .sort((a, b) => a.fifaRank - b.fifaRank);

  return (
    <div className="space-y-6">
      {/* Tätare server-refresh medan Sverige spelar; lugnare annars. */}
      <AutoRefresh
        seconds={liveMatch || swedishMatches.some((m) => m.status === "LIVE") ? 30 : 60}
      />

      {/* ── Live-hero (dominerar när Sverige spelar) ── */}
      {liveMatch && liveEspn && (
        <section className="animate-fade-in card border-flag-500/40 p-5 [animation-fill-mode:both]">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Sverige spelar nu{liveEspn.clock ? ` · ${liveEspn.clock}` : ""}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-lg font-extrabold">{tag(liveMatch.homeTeamId)}</span>
            <span className="shrink-0 rounded-lg bg-white/10 px-3 py-1 text-2xl font-extrabold tabular-nums">
              {liveEspn.homeScore ?? 0}–{liveEspn.awayScore ?? 0}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-lg font-extrabold">{tag(liveMatch.awayTeamId)}</span>
          </div>
          {liveDetails && (liveDetails.goals.length > 0 || liveDetails.cards.length > 0) && (
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-slate-300">
              {liveDetails.goals.map((g, i) => (
                <div key={`g${i}`} className="flex items-center gap-2">
                  <span>⚽</span>
                  <span className="tabular-nums text-slate-500">{g.minute != null ? `${g.minute}'` : ""}</span>
                  <span className="truncate">{g.player}{g.type === "PENALTY" ? " (straff)" : g.type === "OWN" ? " (självmål)" : ""}</span>
                </div>
              ))}
              {liveDetails.cards.map((c, i) => (
                <div key={`c${i}`} className="flex items-center gap-2">
                  <span>{c.card === "YELLOW" ? "🟨" : c.card === "RED" ? "🟥" : "🟨🟥"}</span>
                  <span className="tabular-nums text-slate-500">{c.minute != null ? `${c.minute}'` : ""}</span>
                  <span className="truncate">{c.player}</span>
                </div>
              ))}
            </div>
          )}
          {liveEspn.overUnder != null && (
            <p className="mt-2 text-[11px] text-slate-500">Spelbolagens målgräns: {liveEspn.overUnder} mål</p>
          )}
        </section>
      )}

      {/* ── Sidheader (samma struktur som övriga sidor) ── */}
      <PageHeading
        title="🇸🇪 Sverige"
      >
      <div className="space-y-6">

      {/* ── Nästa avspark (egen rad under headern, stör inte titeln) ──
          Visas bara när turneringen är igång; innan avspark ligger nedräkningen
          i den sammanslagna "Innan avspark"-kortet nedan (en enda Countdown). */}
      {hasWcData && !liveMatch && nextMatch && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nästa avspark</span>
          <Countdown target={nextMatch.kickoff.toISOString()} />
        </div>
      )}

      {/* ── VM 2026 hittills: Sveriges turneringsstatistik (riktig DB-data) ── */}
      {hasWcData ? (
        <section className="animate-fade-in [animation-fill-mode:both]">
          <SectionHeading title="VM 2026 hittills">
          <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QualStat
              label="Matcher"
              value={`${wcFinished.length}`}
              hint={`${wcAgg.wins}V ${wcAgg.draws}O ${wcAgg.losses}F`}
            />
            <QualStat
              label="Mål"
              value={`${wcAgg.gf}–${wcAgg.ga}`}
              hint="gjorda–insläppta"
            />
            <QualStat
              label="Målskillnad"
              value={`${wcGoalDiff > 0 ? "+" : ""}${wcGoalDiff}`}
              accent={wcGoalDiff > 0 ? "pos" : wcGoalDiff < 0 ? "neg" : undefined}
            />
            <QualStat
              label={`Grupp ${SWEDEN_GROUP}`}
              value={swedenRank > 0 ? `${swedenRank}:a` : "—"}
              hint={swedenStanding ? `${swedenStanding.points}p` : undefined}
            />
          </div>

          {/* Senaste matchen + nästa match (eller live-status) */}
          <div className="grid gap-3 sm:grid-cols-2">
            {liveMatch ? (
              <div className="card border-flag-500/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-300">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Pågår nu{liveEspn?.clock ? ` · ${liveEspn.clock}` : ""}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="min-w-0 truncate">{tag(liveMatch.homeTeamId)}</span>
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-base font-extrabold tabular-nums">
                    {liveEspn?.homeScore ?? liveMatch.homeScore ?? 0}–{liveEspn?.awayScore ?? liveMatch.awayScore ?? 0}
                  </span>
                  <span className="min-w-0 truncate text-right">{tag(liveMatch.awayTeamId)}</span>
                </div>
              </div>
            ) : lastWcMatch ? (
              (() => {
                const v = wcMatchView(lastWcMatch);
                const rColor =
                  v.result === "W" ? "text-green-300" : v.result === "D" ? "text-slate-300" : "text-red-300";
                return (
                  <div className="card p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Senaste matchen</div>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span className="min-w-0 truncate">{tag(lastWcMatch.homeTeamId)}</span>
                      <span className={`shrink-0 rounded bg-white/10 px-2 py-0.5 text-base font-extrabold tabular-nums ${rColor}`}>
                        {lastWcMatch.homeScore}–{lastWcMatch.awayScore}
                      </span>
                      <span className="min-w-0 truncate text-right">{tag(lastWcMatch.awayTeamId)}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {dateKey(lastWcMatch.kickoff)} · {lastWcMatch.venue}
                    </div>
                  </div>
                );
              })()
            ) : null}

            {nextMatch ? (
              <div className="card p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Nästa match</div>
                <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="min-w-0 truncate">{tag(nextMatch.homeTeamId)}</span>
                  <span className="shrink-0 text-slate-500">vs</span>
                  <span className="min-w-0 truncate text-right">{tag(nextMatch.awayTeamId)}</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  {dateKey(nextMatch.kickoff)} {timeStr(nextMatch.kickoff)} · {nextMatch.venue}
                </div>
              </div>
            ) : null}
          </div>
          </div>
          </SectionHeading>
        </section>
      ) : (
        <section className="animate-fade-in [animation-fill-mode:both]">
          <SectionHeading title="Innan avspark">
          <div className="card p-4">
            {nextMatch ? (
              <>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Nästa match</div>
                <div className="flex items-center justify-between gap-2 text-base font-extrabold">
                  <span className="min-w-0 truncate">{tag(nextMatch.homeTeamId)}</span>
                  <span className="shrink-0 text-slate-500">vs</span>
                  <span className="min-w-0 truncate text-right">{tag(nextMatch.awayTeamId)}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-slate-500">
                  {dateKey(nextMatch.kickoff)} {timeStr(nextMatch.kickoff)} · {nextMatch.venue}
                </div>
                <div className="mt-3">
                  <Countdown target={nextMatch.kickoff.toISOString()} />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Sveriges VM-matcher annonseras snart.</p>
            )}
            {swedenStanding && (
              <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-slate-500">
                Grupp {SWEDEN_GROUP} · seedad {swedenRank > 0 ? `${swedenRank}:a` : "—"} på FIFA-ranking (#{sweden.fifaRank}).
                Statistik visas så fort Sverige spelat sin första VM-match.
              </p>
            )}
          </div>
          </SectionHeading>
        </section>
      )}

      {/* ── Vägen till VM: form + gruppmatcher ── */}
      <section>
        <SectionHeading title="VM-gruppspelet">
        <div className="space-y-3">
        <div className="card p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Senaste 5 landskamper</div>
          {form.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {form.map((f, i) => (
                <span
                  key={i}
                  title={`${f.opp} ${f.score} (${f.date})`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1 text-xs"
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white ${
                      f.result === "W" ? "bg-green-500/80" : f.result === "D" ? "bg-slate-500/80" : "bg-red-500/70"
                    }`}
                  >
                    {f.result}
                  </span>
                  <span className="text-slate-300">{f.oppFlag} {f.opp}</span>
                  <span className="tabular-nums text-slate-500">{f.score}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Lagform saknas — synka via Admin.</p>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Datum / tid</th>
                  <th className="px-3 py-3 text-left font-medium">Grupp</th>
                  <th className="px-3 py-3 text-left font-medium">Hemma</th>
                  <th className="px-3 py-3 text-left font-medium">Borta</th>
                  <th className="px-3 py-3 text-left font-medium">Arena / stad</th>
                  <th className="px-3 py-3 text-left font-medium">Kanal</th>
                  {user && <th className="px-3 py-3 text-left font-medium">Ditt tips</th>}
                  <th className="px-4 py-3 text-right font-medium">Status / resultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {swedishMatches
                  .filter((m) => m.stage === "GROUP")
                  .map((m) => {
                    const live = espnFor(m);
                    const showScore = m.status === "FINISHED" || (live && live.state !== "pre");
                    const hs = live && live.state !== "pre" ? live.homeScore : m.homeScore;
                    const awayScore = live && live.state !== "pre" ? live.awayScore : m.awayScore;
                    const scoreText = showScore && hs != null && awayScore != null ? `${hs}–${awayScore}` : null;
                    const status = matchStatusLabel(m, live, scoreText);
                    const channel = broadcasterFor(m.channel);
                    return (
                      <tr key={m.id} className="text-slate-300">
                        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-400">
                          {dateKey(m.kickoff)} <span className="text-slate-500">{timeStr(m.kickoff)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">Grupp {SWEDEN_GROUP}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-100">{tag(m.homeTeamId)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-100">{tag(m.awayTeamId)}</td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-xs text-slate-400" title={m.venue}>
                          {m.venue}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {channel ? (
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${channel.color}`} title={`Sänds på ${channel.name}`}>
                              {channel.domain ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={broadcasterLogo(channel.domain)} alt="" width={14} height={14} loading="lazy" className="h-3.5 w-3.5 rounded-[2px]" />
                              ) : (
                                <span>{channel.icon}</span>
                              )}
                              {channel.short}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">–</span>
                          )}
                        </td>
                        {user && (
                          <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold tabular-nums text-slate-200">
                            {myPredText(m.id)}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <span className={`inline-flex min-w-14 justify-center rounded px-2 py-0.5 text-xs font-extrabold tabular-nums ${status.className}`}>
                            {status.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-white/5 md:hidden">
            {swedishMatches
              .filter((m) => m.stage === "GROUP")
              .map((m) => {
                const live = espnFor(m);
                const showScore = m.status === "FINISHED" || (live && live.state !== "pre");
                const hs = live && live.state !== "pre" ? live.homeScore : m.homeScore;
                const awayScore = live && live.state !== "pre" ? live.awayScore : m.awayScore;
                const scoreText = showScore && hs != null && awayScore != null ? `${hs}–${awayScore}` : null;
                const status = matchStatusLabel(m, live, scoreText);
                const channel = broadcasterFor(m.channel);
                return (
                  <div key={m.id} className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Grupp {SWEDEN_GROUP}</div>
                        <div className="mt-0.5 text-xs tabular-nums text-slate-400">
                          {dateKey(m.kickoff)} {timeStr(m.kickoff)}
                        </div>
                      </div>
                      <span className={`inline-flex shrink-0 justify-center rounded px-2 py-0.5 text-xs font-extrabold tabular-nums ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span className="min-w-0 truncate">{tag(m.homeTeamId)}</span>
                      <span className="shrink-0 text-slate-500">vs</span>
                      <span className="min-w-0 truncate text-right">{tag(m.awayTeamId)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span className="truncate">{m.venue}</span>
                      {channel ? (
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${channel.color}`} title={`Sänds på ${channel.name}`}>
                          {channel.domain ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={broadcasterLogo(channel.domain)} alt="" width={14} height={14} loading="lazy" className="h-3.5 w-3.5 rounded-[2px]" />
                          ) : (
                            <span>{channel.icon}</span>
                          )}
                          {channel.short}
                        </span>
                      ) : (
                        <span>–</span>
                      )}
                    </div>
                    {user && (
                      <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                        Ditt tips: <span className="font-semibold tabular-nums text-slate-200">{myPredText(m.id)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
        </div>
        </SectionHeading>
      </section>

      {/* ── Kvalresan 2025-26 (skrapad data) ── */}
      {qual && qualSummary && (
        <>
          {/* Nyckeltal från kvalet */}
          <section>
            <SectionHeading title="Vägen till VM 2026">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QualStat label="Matcher" value={`${qualSummary.played}`} hint={`${qualSummary.wins}V ${qualSummary.draws}O ${qualSummary.losses}F`} />
              <QualStat label="Mål gjorda" value={`${qualSummary.goalsFor}`} hint={`${qualSummary.goalsAgainst} insläppta`} />
              <QualStat label="Målskillnad" value={`${qualSummary.goalDiff > 0 ? "+" : ""}${qualSummary.goalDiff}`} accent={qualSummary.goalDiff >= 0 ? "pos" : "neg"} />
              <QualStat label="Hållna nollor" value={`${qualSummary.cleanSheets}`} hint={`${qualSummary.failedToScore} utan mål`} />
              <QualStat label="Snittpublik" value={qualSummary.avgAttendance ? qualSummary.avgAttendance.toLocaleString("sv-SE") : "—"} />
              <QualStat label="Playoff" value={`${qualSummary.playoffWins}/${qualSummary.playoffPlayed}`} hint="vinster" accent="pos" />
              <QualStat label="Halvlek 1 vs 2" value={qualHalves ? `${qualHalves.scoredFirst}–${qualHalves.scoredSecond}` : "—"} hint="gjorda mål" />
              <QualStat label="Insläppt 1 vs 2" value={qualHalves ? `${qualHalves.concededFirst}–${qualHalves.concededSecond}` : "—"} hint="halvlek" />
            </div>
            </SectionHeading>
          </section>

          {/* Kvalresan som tidslinje */}
          <section>
            <SectionHeading title="Kvalresan match för match">
            <div className="card p-4">
              <ol className="space-y-2">
                {qualMatches.map((m, i) => {
                  const opp = opponentInfo(m.opponent);
                  const sweGoals = m.goals.filter((g) => g.side === "SWE");
                  const oppGoals = m.goals.filter((g) => g.side === "OPP");
                  const rColor =
                    m.result === "W" ? "bg-green-500/80" : m.result === "D" ? "bg-slate-500/80" : "bg-red-500/70";
                  const date = new Date(m.date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
                  return (
                    <li
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-white ${rColor}`}>
                          {m.result}
                        </span>
                        {m.stage === "playoff" && (
                          <span className="chip bg-flag-500/15 text-[10px] text-flag-200">playoff</span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <span className="font-semibold">
                          {m.swedenHome ? "🇸🇪 SWE" : `${opp.flag} ${m.opponent}`}
                        </span>
                        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-extrabold tabular-nums">
                          {m.swedenHome ? `${m.sweScore}–${m.oppScore}` : `${m.oppScore}–${m.sweScore}`}
                        </span>
                        <span className="font-semibold">
                          {m.swedenHome ? `${opp.flag} ${m.opponent}` : "🇸🇪 SWE"}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                        {sweGoals.length > 0 && (
                          <span className="text-pitch-300">
                            ⚽ {sweGoals.map((g) => `${g.player} ${g.minute}'${g.penalty ? " (str)" : ""}`).join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-slate-500">
                        <div>{date}</div>
                        <div className="truncate">{m.venue.split(",").pop()?.trim()}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            </SectionHeading>
          </section>

          {/* Målskyttar i kvalet */}
          {qualScorers.length > 0 && (
            <section>
              <SectionHeading title="Sveriges målskyttar i kvalet">
              <div className="card p-4">
                <div className="space-y-1.5">
                  {qualScorers.map((s) => {
                    const maxGoals = qualScorers[0].goals || 1;
                    const pct = Math.round((s.goals / maxGoals) * 100);
                    return (
                      <div key={s.player} className="flex items-center gap-2 text-sm">
                        <span className="w-28 shrink-0 truncate text-slate-300" title={s.player}>{s.player}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="flex h-full items-center rounded-full bg-pitch-500 px-1.5" style={{ width: `${Math.max(pct, 12)}%` }}>
                            <span className="text-[9px] font-bold text-white">{s.goals}</span>
                          </div>
                        </div>
                        {s.penalties > 0 && (
                          <span className="shrink-0 text-[10px] text-slate-500">varav {s.penalties} straff</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              </SectionHeading>
            </section>
          )}

          {/* Superdetaljerad form: mål för/emot per match, hemma/borta */}
          <section>
            <SectionHeading title="Form i detalj">
            <div className="card overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1 text-left font-medium">Match</th>
                    <th className="py-1 text-center font-medium">H/B</th>
                    <th className="py-1 text-center font-medium">Resultat</th>
                    <th className="py-1 text-right font-medium">Publik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {qualMatches.map((m, i) => {
                    const opp = opponentInfo(m.opponent);
                    const rColor =
                      m.result === "W" ? "text-green-300" : m.result === "D" ? "text-slate-300" : "text-red-300";
                    return (
                      <tr key={i} className="text-slate-300">
                        <td className="py-1.5 whitespace-nowrap">
                          {opp.flag} <span className="font-medium">{opp.name}</span>
                          {m.stage === "playoff" && <span className="ml-1 text-[9px] text-flag-300">PO</span>}
                        </td>
                        <td className="py-1.5 text-center text-xs text-slate-400">{m.swedenHome ? "Hemma" : "Borta"}</td>
                        <td className={`py-1.5 text-center font-bold tabular-nums ${rColor}`}>
                          {m.sweScore}–{m.oppScore}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-xs text-slate-500">
                          {m.attendance ? m.attendance.toLocaleString("sv-SE") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </SectionHeading>
          </section>

          {/* Målminuter i kvalet */}
          {qualScored && qualConceded && (qualScored.total > 0 || qualConceded.total > 0) && (
            <section>
              <SectionHeading title="Målminuter i kvalet">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-pitch-300">Sveriges mål ({qualScored.total})</div>
                  <GoalMinuteHeatmap summary={qualScored} emptyHint="Inga mål i kvalet." />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-flag-300">Insläppta ({qualConceded.total})</div>
                  <GoalMinuteHeatmap summary={qualConceded} emptyHint="Inga insläppta mål i kvalet." />
                </div>
              </div>
              </SectionHeading>
            </section>
          )}
        </>
      )}

      {coachEras.length > 0 && (
        <section>
          <SectionHeading title="Tränar-eror">
            <div className="space-y-3">
              <div className="card p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Sverige under olika förbundskaptener
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {coachEras.map((summary) => (
                    <CoachEraCard
                      key={summary.coach}
                      summary={summary}
                      maxPoints={coachMaxPoints}
                      maxGoals={coachMaxGoals}
                    />
                  ))}
                </div>
              </div>
            </div>
          </SectionHeading>
        </section>
      )}

      {/* ── VM-truppen 2026: statistik + spellista ── */}
      {hasSquad && squad && squadMeta && (
        <>
          <section>
            <SectionHeading title="Truppstatistik">
            <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QualStat label="Spelare" value={`${squad.size}`} hint="uttagna" />
              <QualStat label="Snittålder" value={squad.avgAge != null ? `${squad.avgAge} år` : "—"} />
              <QualStat label="Totalt landskamper" value={squad.totalCaps.toLocaleString("sv-SE")} hint={`${squad.totalGoals} landslagsmål`} />
              <QualStat label="Utlandsproffs" value={`${squad.abroadCount}/${squad.size}`} hint={`${squad.homeCount} i Allsvenskan`} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Profiler</div>
                <dl className="space-y-1.5 text-sm">
                  {squad.captain && (
                    <SquadFact label="Lagkapten" value={squad.captain.name} hint={`${squad.captain.caps} landskamper`} />
                  )}
                  {squad.viceCaptain && (
                    <SquadFact label="Vice kapten" value={squad.viceCaptain.name} hint={`${squad.viceCaptain.caps} landskamper`} />
                  )}
                  {squad.mostCapped && (
                    <SquadFact label="Mest meriterad" value={squad.mostCapped.name} hint={`${squad.mostCapped.caps} landskamper`} />
                  )}
                  {squad.topScorer && (
                    <SquadFact label="Skyttekung" value={squad.topScorer.name} hint={`${squad.topScorer.goals} landslagsmål`} />
                  )}
                  {squad.youngest && squad.youngest.age != null && (
                    <SquadFact label="Yngst" value={squad.youngest.name} hint={`${squad.youngest.age} år`} />
                  )}
                  {squad.oldest && squad.oldest.age != null && (
                    <SquadFact label="Äldst" value={squad.oldest.name} hint={`${squad.oldest.age} år`} />
                  )}
                </dl>
              </div>
              <div className="card p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Positioner</div>
                <div className="space-y-1.5">
                  {squad.positions.map((p) => {
                    const pct = squad.size ? Math.round((p.count / squad.size) * 100) : 0;
                    return (
                      <div key={p.position} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 text-slate-300">{p.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="flex h-full items-center rounded-full bg-flag-500 px-1.5" style={{ width: `${Math.max(pct, 8)}%` }}>
                            <span className="text-[9px] font-bold text-night-900">{p.count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {squad.topClubs.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Flest från samma klubb</div>
                    <div className="flex flex-wrap gap-1.5">
                      {squad.topClubs.map((c) => (
                        <span key={c.club} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300">
                          {c.club}
                          <span className="text-[10px] font-bold text-flag-300">{c.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-500">
                  Spelare i {squad.leagueCount} olika ligor · {squad.abroadCount} utlandsproffs.
                </p>
              </div>
            </div>
            </div>
            </SectionHeading>
          </section>

          {/* Truppen, grupperad per position */}
          <section>
            <SectionHeading title="Truppen">
            <div className="space-y-3">
            <div className="space-y-3">
              {squadGroups.map((g) => (
                <div key={g.position} className="card overflow-x-auto p-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-sm font-bold text-flag-200">{g.label}</h3>
                    <span className="text-xs text-slate-500">{g.players.length} spelare</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-8 py-1 text-left font-medium">#</th>
                        <th className="py-1 text-left font-medium">Spelare</th>
                        <th className="py-1 text-left font-medium">Klubb</th>
                        <th className="w-12 py-1 text-right font-medium">Ålder</th>
                        <th className="w-14 py-1 text-right font-medium">Lk</th>
                        <th className="w-12 py-1 text-right font-medium">Mål</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {g.players.map((p) => (
                        <tr key={`${p.name}-${p.number ?? "x"}`} className="text-slate-300">
                          <td className="py-1.5 tabular-nums text-xs text-slate-500">{p.number ?? "–"}</td>
                          <td className="py-1.5 whitespace-nowrap font-medium">
                            {p.name}
                            {p.captain && <span className="ml-1.5 rounded bg-flag-500/20 px-1 text-[9px] font-bold text-flag-200">C</span>}
                            {p.viceCaptain && <span className="ml-1.5 rounded bg-white/10 px-1 text-[9px] font-bold text-slate-300">VC</span>}
                          </td>
                          <td className="py-1.5 text-xs text-slate-400">
                            {p.club}
                            {!p.abroad && <span className="ml-1 text-[9px] text-pitch-300">(SWE)</span>}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-xs">{p.age != null ? p.age : "–"}</td>
                          <td className="py-1.5 text-right tabular-nums text-xs">{p.caps}</td>
                          <td className="py-1.5 text-right tabular-nums text-xs font-semibold">{p.goals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600">
              Källa: {squadMeta.source.split(" — ")[0]} (Wikipedia, CC BY-SA). {squadMeta.asOf}. Lk = landskamper.
            </p>
            </div>
            </SectionHeading>
          </section>
        </>
      )}

      {/* ── Sverige vs VM-gruppmotståndet ── */}
      <section>
        <SectionHeading title={`Sverige vs grupp ${SWEDEN_GROUP}`}>
        <div className="card p-4">
          <div className="space-y-2">
            {groupFCompare.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${t.isSweden ? "bg-flag-500/10 ring-1 ring-flag-500/30" : "bg-white/[0.02]"}`}
              >
                <span className="w-28 shrink-0 truncate text-sm font-semibold">
                  {t.flag} {t.isSweden ? <span className="text-flag-200">{t.name}</span> : t.name}
                </span>
                <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                  FIFA #{t.fifaRank}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {t.form.length > 0 ? (
                    t.form.map((f, fi) => (
                      <span
                        key={fi}
                        title={`${f.opp} ${f.score} (${f.date})`}
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-bold text-white ${
                          f.result === "W" ? "bg-green-500/80" : f.result === "D" ? "bg-slate-500/80" : "bg-red-500/70"
                        }`}
                      >
                        {f.result}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-600">form saknas</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Sorterat på FIFA-ranking (lägst = bäst). Formrutorna visar de 5 senaste landskamperna.
          </p>
        </div>
        </SectionHeading>
      </section>

      {/* ── Sveriges historiska VM ── */}
      {sweWcHistory.length > 0 && (
        <section>
          <SectionHeading title="Sverige i tidigare VM">
          <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {sweWcHistory.map((e) => (
              <div key={e.tournament} className="card p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-bold">🇸🇪 {e.tournament}</h3>
                  <span className="text-xs text-slate-500">
                    {e.matches} matcher · {e.goalsFor} gjorda, {e.goalsAgainst} insläppta
                  </span>
                </div>
                {e.topScorers.length > 0 ? (
                  <div className="space-y-1">
                    {e.topScorers.map((s) => (
                      <div key={s.player} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-slate-300">{s.player}</span>
                        <span className="flex shrink-0 gap-0.5">
                          {Array.from({ length: s.goals }).map((_, i) => (
                            <span key={i} aria-hidden>⚽</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Inga inrapporterade målskyttar.</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-600">
            Baserat på skrapad turneringsdata (de mästerskap Sverige deltagit i och som finns i historiken).
          </p>
          </div>
          </SectionHeading>
        </section>
      )}

      {/* ── Målminuter: Sveriges gjorda vs insläppta ── */}
      {(goalsScored.total > 0 || goalsConceded.total > 0) && (
        <section>
          <SectionHeading title="När gör Sverige mål?">
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-pitch-300">Gjorda mål</div>
              <GoalMinuteHeatmap summary={goalsScored} emptyHint="Sverige har inte gjort något inrapporterat mål än." />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-flag-300">Insläppta mål</div>
              <GoalMinuteHeatmap summary={goalsConceded} emptyHint="Inga insläppta mål inrapporterade än." />
            </div>
          </div>
          </SectionHeading>
        </section>
      )}

      {/* ── Grupp F-tabell ── */}
      <section>
        <SectionHeading
          title={`Grupp ${SWEDEN_GROUP}`}
          action={results.length > 0 ? "Live från spelade matcher" : "Innan avspark (FIFA-ranking)"}
        >
        <div className="card p-4">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium w-5">#</th>
                <th className="py-1 text-left font-medium">Lag</th>
                <th className="py-1 text-right font-medium w-6">S</th>
                <th className="py-1 text-right font-medium w-8">MS</th>
                <th className="py-1 text-right font-medium w-6">P</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groupF.map((st, i) => {
                const t = teamById.get(st.teamId)!;
                const isSweden = st.teamId === sweden.id;
                return (
                  <tr
                    key={st.teamId}
                    className={isSweden ? "bg-flag-500/10 font-semibold text-flag-100" : i < 2 ? "text-pitch-100" : "text-slate-400"}
                  >
                    <td className="py-1.5 pl-1 tabular-nums text-xs text-slate-500">{i + 1}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {t.flag} <span className="font-medium">{t.code}</span>
                      {i < 2 && <span className="ml-1 text-[10px] text-pitch-400">vidare</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-xs text-slate-400">{st.played}</td>
                    <td className="py-1.5 text-right tabular-nums text-xs text-slate-400">{st.gd > 0 ? "+" : ""}{st.gd}</td>
                    <td className="py-1.5 pr-1 text-right font-semibold tabular-nums">{st.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </SectionHeading>
      </section>

      {/* ── Prognoser: marknad vs liga ── */}
      <section>
        <SectionHeading title="Prognoser">
        <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <PredictionStat label="Tror på gruppseger" pct={pctOfLeague(groupWinnerCount)} count={groupWinnerCount} total={leagueSize} />
          <PredictionStat label="Tror Sverige går vidare" pct={pctOfLeague(advanceCount)} count={advanceCount} total={leagueSize} />
          <PredictionStat label="Tror på VM-guld" pct={pctOfLeague(championCount)} count={championCount} total={leagueSize} />
        </div>

        <p className="text-xs text-slate-500">
          Vinstchans sett från Sveriges håll. <span className="font-semibold text-flag-300">Gult</span> = Sverige vinner,{" "}
          grått = oavgjort, blått = motståndaren.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {swedishMatches
            .filter((m) => m.stage === "GROUP" && m.homeTeam && m.awayTeam)
            .map((m) => {
              const live = espnFor(m);
              const sweHome = m.homeTeamId === sweden.id;
              const opp = sweHome ? m.awayTeam! : m.homeTeam!;
              const espnOdds = live?.odds ?? null;

              // Normalisera allt till Sveriges perspektiv (Sverige / oavgjort / motståndare),
              // så färgen för "Sverige vinner" alltid är samma oavsett hemma/borta.
              let swePct: number;
              let drawPct: number;
              let oppPct: number;
              let title: string;
              let hint: string;

              if (espnOdds) {
                swePct = sweHome ? espnOdds.homePct : espnOdds.awayPct;
                oppPct = sweHome ? espnOdds.awayPct : espnOdds.homePct;
                drawPct = espnOdds.drawPct;
                title = "Spelbolagen";
                const sweDec = sweHome ? espnOdds.homeDec : espnOdds.awayDec;
                const oppDec = sweHome ? espnOdds.awayDec : espnOdds.homeDec;
                hint =
                  sweDec && espnOdds.drawDec && oppDec
                    ? `${sweDec.toFixed(2)} / ${espnOdds.drawDec.toFixed(2)} / ${oppDec.toFixed(2)}`
                    : "live från spelbolag";
              } else {
                const model = marketOdds(m.homeTeam!.fifaRank, m.awayTeam!.fifaRank);
                const mp = marketPct(model);
                swePct = sweHome ? mp["1"] : mp["2"];
                oppPct = sweHome ? mp["2"] : mp["1"];
                drawPct = mp.X;
                title = "Modellens odds";
                const sweDec = sweHome ? model.oddsHome : model.oddsAway;
                const oppDec = sweHome ? model.oddsAway : model.oddsHome;
                hint = `${sweDec.toFixed(2)} / ${model.oddsDraw.toFixed(2)} / ${oppDec.toFixed(2)}`;
              }

              return (
                <div key={m.id} className="card space-y-3 p-4">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>🇸🇪 Sverige</span>
                    <span className="text-xs font-normal text-slate-500">{sweHome ? "hemma mot" : "borta mot"}</span>
                    <span>{opp.flag} {opp.code}</span>
                  </div>
                  <OddsBar
                    title={title}
                    hint={hint}
                    homeCode="SWE"
                    awayCode={opp.code}
                    home={swePct}
                    draw={drawPct}
                    away={oppPct}
                    highlight="home"
                  />
                </div>
              );
            })}
        </div>
        </div>
        </SectionHeading>
      </section>

      {/* ── Möjlig slutspelsväg ── */}
      <section>
        <SectionHeading title="Möjlig slutspelsväg">
        <div className="card p-4">
          <div className="space-y-2">
            {/* Etta och tvåa: exakt en match var. */}
            {koAsWinner && (
              <KoPathRow
                role="Som gruppsegrare"
                roleHint={`1${SWEDEN_GROUP}`}
                slot={koAsWinner}
                opponent={koAsWinner.home.includes(SWEDEN_GROUP) ? koAsWinner.away : koAsWinner.home}
              />
            )}
            {koAsRunnerUp && (
              <KoPathRow
                role="Som tvåa"
                roleHint={`2${SWEDEN_GROUP}`}
                slot={koAsRunnerUp}
                opponent={koAsRunnerUp.home.includes(SWEDEN_GROUP) ? koAsRunnerUp.away : koAsRunnerUp.home}
              />
            )}
            {/* Bästa trea: en av flera möjliga matcher beroende på vilka treor som kvalar. */}
            {koAsThird.length > 0 && (
              <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-flag-200">Som bästa trea</span>
                  <span className="text-xs text-slate-500">
                    en av {koAsThird.length} möjliga matcher — exakt vilken avgörs av vilka treor som går vidare
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {koAsThird.map((slot) => {
                    const oppSlot = slot.home.includes(SWEDEN_GROUP) ? slot.away : slot.home;
                    const opp = oppSlot.match(/^[12]/) ? oppSlot : null; // 1E/2C osv.
                    return (
                      <span
                        key={slot.matchNumber}
                        title={`Match #${slot.matchNumber} · ${slot.venue}`}
                        className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs"
                      >
                        <span className="text-slate-500">möter</span>
                        <span className="font-mono font-semibold text-slate-200">{opp ?? oppSlot}</span>
                        <span className="text-[10px] text-slate-600">#{slot.matchNumber}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            Slot-koder: <span className="font-mono">1E</span> = etta i grupp E, <span className="font-mono">2C</span> = tvåa i grupp C.
          </p>
        </div>
        </SectionHeading>
      </section>
      </div>
      </PageHeading>
    </div>
  );
}

function PredictionStat({ label, pct, count, total }: { label: string; pct: number; count: number; total: number }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums text-flag-300">{pct}%</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">{count} av {total}</div>
    </div>
  );
}

function KoPathRow({
  role,
  roleHint,
  slot,
  opponent,
}: {
  role: string;
  roleHint: string;
  slot: { matchNumber: number; venue: string };
  opponent: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
      <span className="text-slate-300">
        <span className="font-semibold text-flag-200">{role}</span>
        <span className="ml-1.5 font-mono text-[10px] text-slate-500">{roleHint}</span>
        <span className="ml-2 text-xs text-slate-500">match #{slot.matchNumber} · {slot.venue}</span>
      </span>
      <span className="shrink-0 text-xs text-slate-400">
        möter <span className="font-mono font-semibold text-slate-200">{opponent}</span>
      </span>
    </div>
  );
}

function CoachEraCard({ summary, maxPoints, maxGoals }: { summary: CoachEraSummary; maxPoints: number; maxGoals: number }) {
  const pointsPct = maxPoints ? Math.round((summary.pointsPerMatch / maxPoints) * 100) : 0;
  const goalsPct = maxGoals ? Math.round((summary.goalsForPerMatch / maxGoals) * 100) : 0;
  const period = `${summary.from.slice(0, 4)}–${summary.to ? summary.to.slice(0, 4) : "nu"}`;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-100">{summary.coach}</div>
          <div className="text-[11px] text-slate-500">{period}</div>
        </div>
        <div className="rounded-full bg-white/[0.05] px-2 py-1 text-xs font-semibold tabular-nums text-slate-300">
          {summary.matches} matcher
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/[0.03] p-2">
          <div className="text-lg font-extrabold tabular-nums text-green-300">{summary.winPct}%</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">vinster</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-2">
          <div className="text-lg font-extrabold tabular-nums">{summary.goalsForPerMatch}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">mål/match</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-2">
          <div className={`text-lg font-extrabold tabular-nums ${summary.goalDiff >= 0 ? "text-pitch-300" : "text-red-300"}`}>
            {summary.goalDiff > 0 ? "+" : ""}{summary.goalDiff}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">målskillnad</div>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <div>
          <div className="mb-1 flex justify-between text-slate-500">
            <span>Poängsnitt</span>
            <span className="tabular-nums text-slate-300">{summary.pointsPerMatch}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full bg-pitch-500" style={{ width: `${Math.max(pointsPct, 4)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-slate-500">
            <span>Gjorda mål/match</span>
            <span className="tabular-nums text-slate-300">{summary.goalsForPerMatch}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full bg-flag-500" style={{ width: `${Math.max(goalsPct, 4)}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
        <span className="chip">{summary.wins}V {summary.draws}O {summary.losses}F</span>
        <span className="chip">{summary.goalsFor}–{summary.goalsAgainst} mål</span>
        <span className="chip">{summary.cleanSheetPct}% nollor</span>
        {summary.lateGoalPct > 0 && <span className="chip">{summary.lateGoalPct}% sena mål</span>}
      </div>
    </div>
  );
}

function SquadFact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-slate-200">
        {value}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-slate-500">{hint}</span>}
      </dd>
    </div>
  );
}

function QualStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "pos" | "neg";
}) {
  const color = accent === "pos" ? "text-green-300" : accent === "neg" ? "text-red-300" : "text-slate-100";
  return (
    <div className="card p-3 text-center">
      <div className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      {hint && <div className="text-[10px] tabular-nums text-slate-500">{hint}</div>}
    </div>
  );
}
