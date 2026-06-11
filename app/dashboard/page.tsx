import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked, lockAt } from "@/lib/lock";
import { computeTournamentMetrics } from "@/lib/tournament-metrics";
import { fetchFootballNews, SWEDISH_SOURCES } from "@/lib/news";
import { fetchSocialPosts, JOURNALISTS, avatarUrl, profileUrl } from "@/lib/social";
import { broadcasterFor, broadcasterLogo } from "@/lib/broadcast";
import { marketOdds } from "@/lib/odds";
import { fetchDayWeather } from "@/lib/weather";
import { Countdown } from "@/components/Countdown";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewsFeed } from "@/components/NewsFeed";
import { ResultsHeatmap, type HeatTeam, type HeatCell, type CellState } from "@/components/ResultsHeatmap";
import { GoalMinuteHeatmap } from "@/components/GoalMinuteHeatmap";
import { computeGoalMinutes } from "@/lib/goal-minutes";
import { fetchEspnMatches, lookupEspn, type EspnMatch } from "@/lib/espn";
import { CountUp } from "@/components/CountUp";
import { SinceLastVisit } from "@/components/SinceLastVisit";
import { SectionHeading } from "@/components/SectionHeading";
import { PageHeading } from "@/components/PageHeading";
import { PlayerSearchCard } from "@/components/PlayerSearchCard";
import { Klotterplank } from "@/components/Klotterplank";
import { rankRows } from "@/lib/rank";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  GROUP: "Grupp", R32: "32-del", R16: "8-del", QF: "Kvart", SF: "Semi", THIRD: "Brons", FINAL: "Final",
};

function dateKey(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}
function timeStr(d: Date): string {
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
}

// Speglar MatchDetails i lib/football-api.ts (samma form som lib/player-stats-tournament.ts).
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
}

type LiveEventKind = "GOAL" | "PENALTY" | "OWN" | "YELLOW" | "RED" | "YELLOW_RED";

interface LiveEvent {
  kind: LiveEventKind;
  minute: number | null;
  player: string;
  assist: string | null;
  teamTag: string; // "flagga KOD" för laget händelsen tillhör
}

// Plattar ut Match.details till en minut-sorterad händelselista för live-rutan.
// Tål null/ofullständig data — saknade fält utelämnas helt enkelt.
function parseLiveEvents(details: unknown, homeTag: string, awayTag: string): LiveEvent[] {
  const d = (details ?? null) as StoredDetails | null;
  if (!d) return [];
  const events: LiveEvent[] = [];

  for (const g of d.goals ?? []) {
    const player = (g.player ?? "").trim();
    if (!player || player === "?") continue;
    const isOwn = g.type === "OWN";
    // Vid självmål är `side` laget målet räknas FÖR — spelaren tillhör motståndaren.
    const scorerSide: "HOME" | "AWAY" = isOwn ? (g.side === "HOME" ? "AWAY" : "HOME") : g.side;
    events.push({
      kind: isOwn ? "OWN" : g.type === "PENALTY" ? "PENALTY" : "GOAL",
      minute: g.minute,
      player,
      assist: !isOwn ? ((g.assist ?? "").trim() || null) : null,
      teamTag: scorerSide === "HOME" ? homeTag : awayTag,
    });
  }

  for (const c of d.cards ?? []) {
    const player = (c.player ?? "").trim();
    if (!player || player === "?") continue;
    events.push({
      kind: c.card,
      minute: c.minute,
      player,
      assist: null,
      teamTag: c.side === "HOME" ? homeTag : awayTag,
    });
  }

  return events.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
}

function liveEventBadge(kind: LiveEventKind): { label: string; className: string } {
  switch (kind) {
    case "GOAL":
      return { label: "Mål", className: "bg-pitch-500/20 text-pitch-200" };
    case "PENALTY":
      return { label: "Straffmål", className: "bg-pitch-500/20 text-pitch-200" };
    case "OWN":
      return { label: "Självmål", className: "bg-white/10 text-slate-300" };
    case "YELLOW":
      return { label: "Gult kort", className: "bg-yellow-500/20 text-yellow-200" };
    case "RED":
      return { label: "Rött kort", className: "bg-red-500/20 text-red-200" };
    case "YELLOW_RED":
      return { label: "Gult+rött", className: "bg-red-500/20 text-red-200" };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
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

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // Översikten är publik. Inloggade ser sin egen liga; utloggade ser den äldsta
  // ligan som en publik vy (riktig data, ingen personlig "din placering"/ring).
  const scopeLeague = user
    ? { id: user.leagueId, name: user.league.name, tippingMode: user.league.tippingMode as "EXACT" | "X12" }
    : await prisma.league.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, tippingMode: true },
      });
  const scopeLeagueId = scopeLeague?.id ?? null;
  const tippingMode = (scopeLeague?.tippingMode as "EXACT" | "X12" | undefined) ?? "EXACT";

  // Allt nedan beror på den valda ligan (`scopeLeagueId`) och, för inloggade, på
  // spelaren själv — kör i en enda parallell batch istället för flera DB-round-trips.
  const [matches, leagueUsers, news, socialPosts, teams, championPreds, topScorerPicks, myGroupPreds] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoff: "asc" },
    }),
    scopeLeagueId
      ? prisma.user.findMany({
          where: { leagueId: scopeLeagueId },
          include: { score: true },
        })
      : [],
    fetchFootballNews(8),
    fetchSocialPosts(8),
    prisma.team.findMany({
      select: { id: true, code: true, flag: true, name: true, fifaRank: true, recentForm: true },
    }),
    scopeLeagueId
      ? prisma.bracketPrediction.findMany({
          where: { matchNumber: 104, user: { leagueId: scopeLeagueId } },
          select: { winnerTeamId: true },
        })
      : [],
    // Ligans skyttekung-tips (frivilligt). Endast ifyllda.
    scopeLeagueId
      ? prisma.user.findMany({
          where: { leagueId: scopeLeagueId, topScorerPlayer: { not: null } },
          select: { topScorerPlayer: true },
        })
      : [],
    // Spelarens egna tips på avgjorda gruppmatcher — för träffsäkerhetsringen.
    // Endast för inloggade; utloggade har ingen egen ring.
    user
      ? prisma.matchPrediction.findMany({
          where: {
            userId: user.id,
            match: { status: "FINISHED", stage: "GROUP", homeScore: { not: null }, awayScore: { not: null } },
          },
          include: { match: { select: { homeScore: true, awayScore: true } } },
        })
      : [],
  ]);

  const now = new Date();
  const locked = isLocked(now);

  // ── Status nu ───────────────────────────────────────────────────────────────
  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED" && m.kickoff > now);
  const nextMatch = upcoming[0] ?? null;
  const finishedSorted = matches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime());
  // Tidpunkter då resultat senast uppdaterades — driver "Sedan du var här".
  const resultTimes = finishedSorted.map((m) => m.updatedAt.toISOString());

  // Dagens matcher, annars de närmaste kommande.
  const todayKey = dateKey(now);
  const todays = matches.filter((m) => dateKey(m.kickoff) === todayKey);
  const focusMatches = (todays.length ? todays : upcoming.slice(0, 5)).slice(0, 6);

  // ── ESPN live-data + riktiga odds för fokus- och livematcherna (tyst fallback) ─
  const espn = await fetchEspnMatches([...focusMatches, ...live].map((m) => m.kickoff));

  // ── Dagens väder för spelorterna (eller nästa matchdags). Samma källa som
  //    nav-widgeten; tyst fallback (tom lista) om Open-Meteo är nere. ───────────
  const dayWeather = await fetchDayWeather(
    matches.map((m) => ({ kickoff: m.kickoff, venue: m.venue, status: m.status })),
  );

  // ── Klotterplank: senaste meddelandena för en första målning utan flimmer ─────
  // Den slimmade raden roterar bara de senaste och visar samma i sitt popover,
  // så en liten seed räcker; klienten hämtar full lista + antal direkt via GET.
  const guestbookEntries = await prisma.guestbookEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, name: true, message: true, createdAt: true },
  });
  const guestbookInitial = guestbookEntries.map((e) => ({
    id: e.id,
    name: e.name,
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }));

  // ── Liga-statistik ──────────────────────────────────────────────────────────
  const ranked = leagueUsers.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    submitted: u.submitted,
    total: u.score?.total ?? 0,
    isMe: user ? u.id === user.id : false,
  }));
  const rankedRows = rankRows(ranked).map((r) => ({ ...r.row, rank: r.rank }));
  const me = rankedRows.find((r) => r.isMe);

  // ── Turneringspuls ────────────────────────────────────────────────────────────
  const metrics = computeTournamentMetrics(
    matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      details: m.details,
    })),
  );
  // Målminuter aggregerade över hela turneringen (5-minutersintervall).
  const goalMinutes = computeGoalMinutes(
    matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      status: m.status,
      details: m.details,
    })),
  );

  const teamById = new Map(matches.flatMap((m) => [m.homeTeam, m.awayTeam]).filter(Boolean).map((t) => [t!.id, t!]));
  const teamTag = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? `${t.flag} ${t.code}` : "—";
  };

  // ── Liga-konsensus för fokusmatcher (gruppmatcher) ───────────────────────────
  const focusMatchIds = focusMatches.map((m) => m.id);
  const focusGroupMatchIds = focusMatches.filter((m) => m.stage === "GROUP").map((m) => m.id);
  const leagueUserIds = leagueUsers.map((u) => u.id);
  const consensusPreds =
    focusGroupMatchIds.length && leagueUserIds.length
      ? await prisma.matchPrediction.findMany({
          where: { matchId: { in: focusGroupMatchIds }, userId: { in: leagueUserIds } },
          include: { match: { select: { matchNumber: true } } },
        })
      : [];
  const myFocusPreds =
    user && focusMatchIds.length
      ? await prisma.matchPrediction.findMany({
          where: { userId: user.id, matchId: { in: focusMatchIds } },
          select: { matchId: true, predHome: true, predAway: true, predOutcome: true },
        })
      : [];
  const myPredByMatch = new Map(myFocusPreds.map((p) => [p.matchId, p]));
  const myPredText = (matchId: string): string => {
    const p = myPredByMatch.get(matchId);
    if (!p) return "–";
    if (tippingMode === "X12") return p.predOutcome ?? "–";
    return p.predHome != null && p.predAway != null ? `${p.predHome}–${p.predAway}` : "–";
  };

  // matchNumber -> { "1"|"X"|"2": antal }
  const tally = new Map<number, { "1": number; X: number; "2": number; total: number }>();
  for (const p of consensusPreds) {
    const n = p.match.matchNumber;
    let outcome: "1" | "X" | "2" | null = null;
    if (tippingMode === "X12") outcome = (p.predOutcome as "1" | "X" | "2") ?? null;
    else if (p.predHome != null && p.predAway != null)
      outcome = p.predHome > p.predAway ? "1" : p.predHome < p.predAway ? "2" : "X";
    if (!outcome) continue;
    const cur = tally.get(n) ?? { "1": 0, X: 0, "2": 0, total: 0 };
    cur[outcome]++;
    cur.total++;
    tally.set(n, cur);
  }

  // ── Trender & snackisar ───────────────────────────────────────────────────────
  type TeamMeta = { id: string; code: string; flag: string; name: string; fifaRank: number; form: ("W" | "D" | "L")[] };
  const teamMeta = new Map<string, TeamMeta>(
    teams.map((t) => {
      const rf = Array.isArray(t.recentForm) ? (t.recentForm as unknown as { result: "W" | "D" | "L" }[]) : [];
      return [t.id, {
        id: t.id, code: t.code, flag: t.flag, name: t.name, fifaRank: t.fifaRank,
        form: rf.map((f) => f.result).filter((r): r is "W" | "D" | "L" => r === "W" || r === "D" || r === "L").slice(0, 5),
      }];
    }),
  );
  const metaTag = (id?: string | null) => {
    const t = id ? teamMeta.get(id) : null;
    return t ? `${t.flag} ${t.code}` : "—";
  };

  // Ligans mest tippade världsmästare.
  const champCount = new Map<string, number>();
  for (const p of championPreds) if (p.winnerTeamId) champCount.set(p.winnerTeamId, (champCount.get(p.winnerTeamId) ?? 0) + 1);
  const champTotal = [...champCount.values()].reduce((a, b) => a + b, 0);
  const topChampions = [...champCount.entries()]
    .map(([id, count]) => ({ id, count, meta: teamMeta.get(id) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Ligans mest tippade skyttekung (frivilligt tips). Gruppera skiftlägesokänsligt.
  const scorerCount = new Map<string, { label: string; count: number }>();
  for (const u of topScorerPicks) {
    const name = (u.topScorerPlayer ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const e = scorerCount.get(key) ?? { label: name, count: 0 };
    e.count++;
    scorerCount.set(key, e);
  }
  const scorerTotal = [...scorerCount.values()].reduce((a, b) => a + b.count, 0);
  const topScorers = [...scorerCount.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  // Lag i bäst form (poäng på senaste 5: W=3, D=1, L=0).
  const formPts = (f: ("W" | "D" | "L")[]) => f.reduce((a, r) => a + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  const inForm = [...teamMeta.values()]
    .filter((t) => t.form.length >= 3)
    .map((t) => ({ ...t, pts: formPts(t.form) }))
    .sort((a, b) => b.pts - a.pts || a.fifaRank - b.fifaRank)
    .slice(0, 5);

  // Största skrällen: avslutad match där vinnaren var sämre FIFA-rankad än förloraren.
  type Upset = { homeId: string; awayId: string; homeScore: number; awayScore: number; winnerId: string; loserId: string; gap: number; kickoff: Date };
  let biggestUpset: Upset | null = null;
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null || m.homeScore === m.awayScore) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    const loserId = winnerId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
    const wr = teamMeta.get(winnerId)?.fifaRank ?? 99;
    const lr = teamMeta.get(loserId)?.fifaRank ?? 99;
    const gap = wr - lr; // positivt = lägre rankat lag vann (skräll)
    if (gap > 0 && (!biggestUpset || gap > biggestUpset.gap)) {
      biggestUpset = {
        homeId: m.homeTeamId, awayId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore,
        winnerId, loserId, gap, kickoff: m.kickoff,
      };
    }
  }

  // ── Resultatkarta (heatmap över alla lag × alla omgångar) ─────────────────────
  const HEAT_COLS = ["G1", "G2", "G3", "R32", "R16", "QF", "SF", "FINAL"] as const;
  const koCol: Record<string, number> = { R32: 3, R16: 4, QF: 5, SF: 6, FINAL: 7, THIRD: 7 };
  const stageFull: Record<string, string> = {
    GROUP: "Grupp", R32: "32-del", R16: "8-del", QF: "Kvart", SF: "Semi", THIRD: "Brons", FINAL: "Final",
  };
  type TM = { stage: string; kickoff: Date; gf: number | null; ga: number | null; status: string; oppId: string | null };
  const perTeam = new Map<string, TM[]>();
  for (const m of matches) {
    for (const home of [true, false]) {
      const teamId = home ? m.homeTeamId : m.awayTeamId;
      if (!teamId) continue;
      const arr = perTeam.get(teamId) ?? [];
      arr.push({
        stage: m.stage, kickoff: m.kickoff, status: m.status,
        gf: home ? m.homeScore : m.awayScore,
        ga: home ? m.awayScore : m.homeScore,
        oppId: home ? m.awayTeamId : m.homeTeamId,
      });
      perTeam.set(teamId, arr);
    }
  }
  const heatTeams: HeatTeam[] = teams
    .map((tm) => {
      const myTag = `${tm.flag} ${tm.code}`;
      const cells: HeatCell[] = HEAT_COLS.map(() => ({ state: "none" as CellState, margin: 0, title: "" }));
      let points = 0;
      let played = 0;
      const cellFor = (t: TM): HeatCell => {
        const oppTag = t.oppId ? metaTag(t.oppId) : "?";
        const head = `${stageFull[t.stage] ?? t.stage}: ${myTag}`;
        if (t.status === "FINISHED" && t.gf != null && t.ga != null) {
          const margin = Math.abs(t.gf - t.ga);
          const state: CellState = t.gf > t.ga ? "W" : t.gf < t.ga ? "L" : "D";
          points += state === "W" ? 3 : state === "D" ? 1 : 0;
          played++;
          return { state, margin, title: `${head} ${t.gf}–${t.ga} ${oppTag}` };
        }
        if (t.status === "LIVE") {
          return { state: "live", margin: 0, title: `${head} ${t.gf ?? 0}–${t.ga ?? 0} ${oppTag} (live)` };
        }
        return { state: "upcoming", margin: 0, title: `${head} mot ${oppTag} (kommande)` };
      };
      const mine = (perTeam.get(tm.id) ?? []).slice().sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
      let g = 0;
      for (const t of mine) {
        if (t.stage === "GROUP") {
          if (g < 3) cells[g] = cellFor(t);
          g++;
        } else {
          const ci = koCol[t.stage];
          if (ci != null) cells[ci] = cellFor(t);
        }
      }
      return { id: tm.id, code: tm.code, flag: tm.flag, name: tm.name, points, played, cells };
    })
    .sort((a, b) => b.points - a.points || b.played - a.played
      || (teamMeta.get(a.id)?.fifaRank ?? 99) - (teamMeta.get(b.id)?.fifaRank ?? 99));

  return (
    <div className="space-y-6">
      {/* Tätare server-refresh medan matcher pågår; lugnare annars. */}
      <AutoRefresh seconds={live.length > 0 ? 30 : 60} />

      <PageHeading
        title="Översikt"
      >
      <div className="flex flex-col gap-6">
      {/* ── Hero: status nu (live-läget från detta VM ligger alltid högst upp) ── */}
      <section className="animate-fade-in [animation-fill-mode:both]">
        <div className={`card flex flex-col justify-between gap-3 p-5 ${live.length > 0 ? "animate-live-glow border-red-500/40 motion-reduce:animate-none" : ""}`}>
          {live.length > 0 ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-300">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-red-200">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  LIVE
                </span>
                Spelas just nu{live.length > 1 && <span className="text-slate-500">· {live.length} matcher</span>}
              </div>
              <div className="space-y-3">
                {live.map((m) => {
                  const liveEspn = m.homeTeam && m.awayTeam
                    ? lookupEspn(espn, m.homeTeam.code, m.awayTeam.code)
                    : null;
                  const useLiveScore =
                    liveEspn && liveEspn.state !== "pre" && liveEspn.homeScore != null && liveEspn.awayScore != null;
                  const hs = useLiveScore ? liveEspn.homeScore : (m.homeScore ?? 0);
                  const as = useLiveScore ? liveEspn.awayScore : (m.awayScore ?? 0);
                  const clock = liveEspn?.state === "in" ? liveEspn.clock : null;
                  const homeTag = teamTag(m.homeTeamId);
                  const awayTag = teamTag(m.awayTeamId);
                  const events = parseLiveEvents(m.details, homeTag, awayTag);
                  const shootout = ((m.details ?? null) as StoredDetails | null)?.shootout ?? null;
                  const roundLabel = `${STAGE_LABEL[m.stage] ?? m.stage}${m.groupId ? ` ${m.groupId}` : m.round ? ` · ${m.round}` : ""}`;
                  return (
                    <div key={m.id} className="overflow-hidden rounded-lg bg-white/5">
                      <Link
                        href="/matcher"
                        className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/10"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {homeTag} <span className="text-slate-500">vs</span> {awayTag}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {clock && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-red-200">
                              {clock}
                            </span>
                          )}
                          <span className="rounded bg-red-500/20 px-2 py-0.5 text-sm font-bold tabular-nums text-red-200">
                            {hs}–{as}
                          </span>
                        </span>
                      </Link>
                      <div className="truncate px-3 pb-2 text-[11px] text-slate-500">
                        {roundLabel} · {m.venue}
                      </div>
                      {(events.length > 0 || shootout) && (
                        <ul className="space-y-1 border-t border-white/10 px-3 py-2">
                          {events.map((ev, i) => {
                            const badge = liveEventBadge(ev.kind);
                            return (
                              <li key={i} className="flex items-baseline gap-2 text-xs text-slate-300">
                                <span className="w-7 shrink-0 text-right tabular-nums text-slate-500">
                                  {ev.minute != null ? `${ev.minute}'` : ""}
                                </span>
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                                  {badge.label}
                                </span>
                                <span className="min-w-0 truncate">
                                  <span className="font-semibold text-slate-100">{ev.player}</span>
                                  {ev.assist && <span className="text-slate-500"> (assist: {ev.assist})</span>}
                                </span>
                                <span className="ml-auto shrink-0 text-slate-400">{ev.teamTag}</span>
                              </li>
                            );
                          })}
                          {shootout && (
                            <li className="flex items-baseline gap-2 text-xs text-slate-300">
                              <span className="w-7 shrink-0" />
                              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                Straffar
                              </span>
                              <span className="font-semibold tabular-nums text-slate-100">
                                {shootout.home}–{shootout.away}
                              </span>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : nextMatch ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {locked ? "Nästa avspark" : "Turneringen startar om"}
              </div>
              <div>
                <div className="mb-3 text-lg font-bold">
                  {nextMatch.homeTeam ? teamTag(nextMatch.homeTeamId) : (nextMatch.homeSlot ?? "?")}
                  <span className="mx-2 text-slate-500">vs</span>
                  {nextMatch.awayTeam ? teamTag(nextMatch.awayTeamId) : (nextMatch.awaySlot ?? "?")}
                </div>
                <Countdown target={(locked ? nextMatch.kickoff : lockAt()).toISOString()} />
                <p className="mt-2 text-xs text-slate-500">
                  {dateKey(nextMatch.kickoff)} {timeStr(nextMatch.kickoff)} · {nextMatch.venue}
                </p>
              </div>
            </>
          ) : (
            <p className="text-slate-400">Inga kommande matcher.</p>
          )}
        </div>
      </section>

      <Klotterplank initialEntries={guestbookInitial} loggedIn={!!user} />

      <SinceLastVisit rank={me?.rank ?? null} points={me?.total ?? 0} resultTimes={resultTimes} />

      {/* ── Turneringspuls ── */}
      <section className="animate-fade-in [animation-delay:60ms] [animation-fill-mode:both]">
        <SectionHeading title="Turneringspuls">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Matcher spelade" value={metrics.matchesPlayed} />
              <Metric label="Mål totalt" value={metrics.totalGoals} />
              <Metric label="Mål / match" value={metrics.matchesPlayed ? metrics.goalsPerMatch : "–"} decimals={2} />
              <Metric label="Hållna nollor" value={metrics.cleanSheets} />
              <Metric label="Gula / Röda" value={`${metrics.yellowCards}/${metrics.redCards}`} />
              <Metric label="Straffavgöranden" value={metrics.shootouts} />
            </div>
            {(metrics.topScoringTeams.length > 0 || metrics.topScorers.length > 0) && (
              <div className="grid gap-3 md:grid-cols-2">
                {metrics.topScoringTeams.length > 0 && (
                  <div className="card p-4">
                    <h3 className="mb-2 text-sm font-bold">Målfarligaste lag</h3>
                    <BarList
                      items={metrics.topScoringTeams.map((t) => ({ label: teamTag(t.teamId), value: t.goals }))}
                    />
                  </div>
                )}
                {metrics.topScorers.length > 0 && (
                  <div className="card p-4">
                    <h3 className="mb-2 text-sm font-bold">Skytteliga</h3>
                    <BarList items={metrics.topScorers.map((s) => ({ label: s.player, value: s.goals }))} />
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionHeading>
      </section>

      {/* ── Dagens väder på spelorterna ── */}
      {dayWeather.items.length > 0 && (
        <section className="animate-fade-in [animation-delay:120ms] [animation-fill-mode:both]">
          <SectionHeading
            title={dayWeather.isToday ? "Väder på dagens spelorter" : "Väder på nästa matchdags spelorter"}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {dayWeather.items.map((w) => (
                <div key={w.venue} className="card flex items-center gap-3 p-3">
                  <span className="text-2xl leading-none" aria-hidden>{w.emoji}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-200" title={w.venue}>{w.city}</div>
                    <div className="truncate text-[11px] text-slate-400">{w.label}</div>
                    <div className="mt-0.5 text-xs tabular-nums text-slate-300">
                      {w.tempC != null ? `${w.tempC}°` : "–"}
                      {(w.high != null || w.low != null) && (
                        <span className="ml-1 text-slate-500">
                          {w.high != null ? `${w.high}°` : "–"} / {w.low != null ? `${w.low}°` : "–"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionHeading>
        </section>
      )}

      {/* ── Fokusmatcher + ligakonsensus ── */}
      <section className="animate-fade-in [animation-delay:180ms] [animation-fill-mode:both]">
        <SectionHeading
          title={todays.length ? "Dagens matcher" : "Kommande matcher"}
          action={<Link href="/matcher" className="text-pitch-300 hover:underline">Alla matcher →</Link>}
        >
        {focusMatches.length === 0 ? (
          <p className="card p-4 text-sm text-slate-400">Inga matcher att visa.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Datum / tid</th>
                    <th className="px-3 py-3 text-left font-medium">Grupp / omgång</th>
                    <th className="px-3 py-3 text-left font-medium">Hemma</th>
                    <th className="px-3 py-3 text-left font-medium">Borta</th>
                    <th className="px-3 py-3 text-left font-medium">Arena / stad</th>
                    <th className="px-3 py-3 text-left font-medium">Kanal</th>
                    {user && <th className="px-3 py-3 text-left font-medium">Ditt tips</th>}
                    <th className="px-3 py-3 text-left font-medium">Odds</th>
                    <th className="px-3 py-3 text-left font-medium">Ligan</th>
                    <th className="px-4 py-3 text-right font-medium">Status / resultat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {focusMatches.map((m) => {
                    const t = tally.get(m.matchNumber);
                    const pct = (k: "1" | "X" | "2") => (t && t.total ? Math.round((t[k] / t.total) * 100) : 0);
                    const homeName = m.homeTeam ? teamTag(m.homeTeamId) : (m.homeSlot ?? "?");
                    const awayName = m.awayTeam ? teamTag(m.awayTeamId) : (m.awaySlot ?? "?");
                    const channel = broadcasterFor(m.channel);
                    const odds = m.homeTeam && m.awayTeam
                      ? marketOdds(teamMeta.get(m.homeTeamId!)?.fifaRank ?? 99, teamMeta.get(m.awayTeamId!)?.fifaRank ?? 99)
                      : null;
                    const live = m.homeTeam && m.awayTeam
                      ? lookupEspn(espn, teamMeta.get(m.homeTeamId!)?.code, teamMeta.get(m.awayTeamId!)?.code)
                      : null;
                    const espnOdds = live?.odds ?? null;
                    const useLiveScore = live && live.state !== "pre" && live.homeScore != null && live.awayScore != null;
                    const hs = useLiveScore ? live.homeScore : m.homeScore;
                    const as = useLiveScore ? live.awayScore : m.awayScore;
                    const showScore = (m.status === "FINISHED" || useLiveScore) && hs != null && as != null;
                    const scoreText = showScore ? `${hs}–${as}` : null;
                    const status = matchStatusLabel(m, live, scoreText);
                    const roundLabel = `${STAGE_LABEL[m.stage] ?? m.stage}${m.groupId ? ` ${m.groupId}` : m.round ? ` · ${m.round}` : ""}`;
                    const oddsText = espnOdds?.homeDec && espnOdds.drawDec && espnOdds.awayDec
                      ? `${espnOdds.homeDec.toFixed(2)} / ${espnOdds.drawDec.toFixed(2)} / ${espnOdds.awayDec.toFixed(2)}`
                      : odds
                        ? `${odds.oddsHome.toFixed(2)} / ${odds.oddsDraw.toFixed(2)} / ${odds.oddsAway.toFixed(2)}`
                        : "–";
                    const leagueText = t && t.total > 0 ? `1 ${pct("1")}% · X ${pct("X")}% · 2 ${pct("2")}%` : "–";
                    const isLive = m.status === "LIVE" || live?.state === "in";

                    return (
                      <tr key={m.id} className={`text-slate-300 ${isLive ? "bg-red-500/[0.06]" : ""}`}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-400">
                          {dateKey(m.kickoff)} <span className="text-slate-500">{timeStr(m.kickoff)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{roundLabel}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-100">{homeName}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-100">{awayName}</td>
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
                        <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-slate-400">
                          <span title={espnOdds ? "Spelbolagen" : odds ? "Modellens odds" : undefined}>{oddsText}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-slate-400" title={t && t.total > 0 ? `${t.total} tips` : undefined}>
                          {leagueText}
                        </td>
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
              {focusMatches.map((m) => {
                const t = tally.get(m.matchNumber);
                const pct = (k: "1" | "X" | "2") => (t && t.total ? Math.round((t[k] / t.total) * 100) : 0);
                const homeName = m.homeTeam ? teamTag(m.homeTeamId) : (m.homeSlot ?? "?");
                const awayName = m.awayTeam ? teamTag(m.awayTeamId) : (m.awaySlot ?? "?");
                const channel = broadcasterFor(m.channel);
                const odds = m.homeTeam && m.awayTeam
                  ? marketOdds(teamMeta.get(m.homeTeamId!)?.fifaRank ?? 99, teamMeta.get(m.awayTeamId!)?.fifaRank ?? 99)
                  : null;
                const live = m.homeTeam && m.awayTeam
                  ? lookupEspn(espn, teamMeta.get(m.homeTeamId!)?.code, teamMeta.get(m.awayTeamId!)?.code)
                  : null;
                const espnOdds = live?.odds ?? null;
                const useLiveScore = live && live.state !== "pre" && live.homeScore != null && live.awayScore != null;
                const hs = useLiveScore ? live.homeScore : m.homeScore;
                const as = useLiveScore ? live.awayScore : m.awayScore;
                const showScore = (m.status === "FINISHED" || useLiveScore) && hs != null && as != null;
                const scoreText = showScore ? `${hs}–${as}` : null;
                const status = matchStatusLabel(m, live, scoreText);
                const roundLabel = `${STAGE_LABEL[m.stage] ?? m.stage}${m.groupId ? ` ${m.groupId}` : m.round ? ` · ${m.round}` : ""}`;
                const oddsText = espnOdds?.homeDec && espnOdds.drawDec && espnOdds.awayDec
                  ? `${espnOdds.homeDec.toFixed(2)} / ${espnOdds.drawDec.toFixed(2)} / ${espnOdds.awayDec.toFixed(2)}`
                  : odds
                    ? `${odds.oddsHome.toFixed(2)} / ${odds.oddsDraw.toFixed(2)} / ${odds.oddsAway.toFixed(2)}`
                    : "–";
                const isLive = m.status === "LIVE" || live?.state === "in";

                return (
                  <div key={m.id} className={`p-4 ${isLive ? "bg-red-500/[0.06]" : ""}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{roundLabel}</div>
                        <div className="mt-0.5 text-xs tabular-nums text-slate-400">
                          {dateKey(m.kickoff)} {timeStr(m.kickoff)}
                        </div>
                      </div>
                      <span className={`inline-flex shrink-0 justify-center rounded px-2 py-0.5 text-xs font-extrabold tabular-nums ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span className="min-w-0 truncate">{homeName}</span>
                      <span className="shrink-0 text-slate-500">vs</span>
                      <span className="min-w-0 truncate text-right">{awayName}</span>
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
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                      {user && (
                        <div>
                          Ditt tips: <span className="font-semibold tabular-nums text-slate-200">{myPredText(m.id)}</span>
                        </div>
                      )}
                      <div>
                        Odds: <span className="tabular-nums text-slate-300">{oddsText}</span>
                      </div>
                      <div className={user ? "col-span-2" : "col-span-1"}>
                        Ligan:{" "}
                        {t && t.total > 0 ? (
                          <span className="tabular-nums text-slate-300">
                            1 {pct("1")}% · X {pct("X")}% · 2 {pct("2")}% ({t.total} tips)
                          </span>
                        ) : (
                          <span className="text-slate-600">–</span>
                        )}
                      </div>
                      {live?.overUnder != null && (
                        <div className="col-span-2">
                          Målbild: <span className="tabular-nums text-flag-300">O/U {live.overUnder}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </SectionHeading>
      </section>

      {/* ── Sök spelare ── */}
      <PlayerSearchCard />

      {/* ── Resultatkarta (heatmap) ── */}
      <section className="animate-fade-in [animation-delay:240ms] [animation-fill-mode:both]">
        <SectionHeading title="Resultatkarta">
          <ResultsHeatmap teams={heatTeams} />
        </SectionHeading>
      </section>

      {/* ── Målminuter (heatmap) ── */}
      <section className="animate-fade-in [animation-delay:300ms] [animation-fill-mode:both]">
        <SectionHeading title="När faller målen?">
          <GoalMinuteHeatmap
            summary={goalMinutes}
            emptyHint="Inga målminuter inrapporterade än — fylls på när matcherna spelats och detaljer synkats."
          />
        </SectionHeading>
      </section>

      {/* ── Trender & snackisar ── */}
      <section className="animate-fade-in [animation-delay:360ms] [animation-fill-mode:both]">
        <SectionHeading title="Trender & snackisar">
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Ligans mästartips */}
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-bold">Ligans mästartips</h3>
            {topChampions.length === 0 ? (
              <p className="text-sm text-slate-500">Inga mästartips än.</p>
            ) : (
              <div className="space-y-1.5">
                {topChampions.map((c) => {
                  const pct = champTotal ? Math.round((c.count / champTotal) * 100) : 0;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 truncate text-slate-300">
                        {c.meta ? `${c.meta.flag} ${c.meta.code}` : "—"}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-flag-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
                    </div>
                  );
                })}
                <p className="pt-1 text-[10px] text-slate-500">
                  Baserat på {champTotal} tips. FIFA-rankad{" "}
                  {topChampions[0]?.meta ? `#${topChampions[0].meta.fifaRank}` : "—"} toppar.
                </p>
              </div>
            )}
          </div>

          {/* Ligans skyttekung-tips */}
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-bold">⚽ Ligans skyttekung-tips</h3>
            {topScorers.length === 0 ? (
              <p className="text-sm text-slate-500">Ingen har tippat skyttekung än (frivilligt).</p>
            ) : (
              <div className="space-y-1.5">
                {topScorers.map((s) => {
                  const pct = scorerTotal ? Math.round((s.count / scorerTotal) * 100) : 0;
                  return (
                    <div key={s.label} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 truncate text-slate-300" title={s.label}>{s.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-pitch-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-400">{s.count} st</span>
                    </div>
                  );
                })}
                <p className="pt-1 text-[10px] text-slate-500">Baserat på {scorerTotal} tips i ligan.</p>
              </div>
            )}
          </div>

          {/* Lag i bäst form */}
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-bold">Bäst form</h3>
            {inForm.length === 0 ? (
              <p className="text-sm text-slate-500">Lagform saknas — synka via Admin.</p>
            ) : (
              <div className="space-y-1.5">
                {inForm.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-300">{t.flag} {t.code}</span>
                    <span className="flex shrink-0 gap-0.5">
                      {t.form.map((r, i) => (
                        <span
                          key={i}
                          className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-bold text-white ${
                            r === "W" ? "bg-green-500/80" : r === "D" ? "bg-slate-500/80" : "bg-red-500/70"
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Största skrällen */}
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-bold">Största skrällen</h3>
            {biggestUpset ? (
              <div className="space-y-1.5">
                <div className="text-sm font-semibold">
                  {metaTag(biggestUpset.homeId)} {biggestUpset.homeScore}–{biggestUpset.awayScore} {metaTag(biggestUpset.awayId)}
                </div>
                <p className="text-xs text-slate-400">
                  {metaTag(biggestUpset.winnerId)} (FIFA #{teamMeta.get(biggestUpset.winnerId)?.fifaRank}) slog{" "}
                  {metaTag(biggestUpset.loserId)} (FIFA #{teamMeta.get(biggestUpset.loserId)?.fifaRank})
                </p>
                <span className="chip text-flag-300">{biggestUpset.gap} placeringar bättre motstånd</span>
                <p className="text-[10px] text-slate-500">{dateKey(biggestUpset.kickoff)}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Ingen skräll än — favoriterna håller.</p>
            )}
          </div>
        </div>
        </SectionHeading>
      </section>

      {/* ── Fotbollsnyheter ── */}
      <div className="animate-fade-in [animation-delay:420ms] [animation-fill-mode:both]">
        <NewsFeed items={news} swedishSources={SWEDISH_SOURCES} />
      </div>

      {/* ── Snack på X ── */}
      <section className="animate-fade-in [animation-delay:480ms] [animation-fill-mode:both]">
        <SectionHeading title="Snack på X">
        {socialPosts.length > 0 ? (
          <div className="card divide-y divide-white/5">
            {socialPosts.map((post, i) => (
              <a
                key={i}
                href={post.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(post.handle)}
                  alt=""
                  width={36}
                  height={36}
                  loading="lazy"
                  className="h-9 w-9 shrink-0 rounded-full bg-white/5"
                />
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">{post.author}</span> @{post.handle}
                  </div>
                  <p className="text-sm text-slate-200">{post.text}</p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {JOURNALISTS.map((j) => (
                <a
                  key={j.handle}
                  href={profileUrl(j.handle)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="card flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl(j.handle)}
                    alt=""
                    width={36}
                    height={36}
                    loading="lazy"
                    className="h-9 w-9 shrink-0 rounded-full bg-white/5"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-200">{j.name}</div>
                    <div className="truncate text-xs text-slate-400">@{j.handle} · {j.blurb}</div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
        </SectionHeading>
      </section>
      </div>
      </PageHeading>
    </div>
  );
}

function Metric({ label, value, decimals = 0 }: { label: string; value: number | string; decimals?: number }) {
  return (
    <div className="card p-3 text-center transition hover:-translate-y-0.5 hover:ring-1 hover:ring-pitch-500/40">
      <div className="text-2xl font-extrabold tabular-nums">
        {typeof value === "number" ? <CountUp value={value} decimals={decimals} /> : value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate text-slate-300">{it.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-pitch-500" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
