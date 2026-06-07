import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked, lockAt } from "@/lib/lock";
import { computeTournamentMetrics } from "@/lib/tournament-metrics";
import { fetchFootballNews, SWEDISH_SOURCES } from "@/lib/news";
import { fetchSocialPosts, JOURNALISTS, avatarUrl, profileUrl } from "@/lib/social";
import { broadcasterFor, broadcasterLogo } from "@/lib/broadcast";
import { marketOdds, marketPct } from "@/lib/odds";
import { Countdown } from "@/components/Countdown";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewsFeed } from "@/components/NewsFeed";
import { ResultsHeatmap, type HeatTeam, type HeatCell, type CellState } from "@/components/ResultsHeatmap";
import { GoalMinuteHeatmap } from "@/components/GoalMinuteHeatmap";
import { computeGoalMinutes } from "@/lib/goal-minutes";
import { GroupedBarChart, ComparisonBars, TopScorersGrid } from "@/components/HistoryCharts";
import {
  goalsByMinuteBucket,
  tournamentStats,
  goalsPerMatchDistribution,
  dramaStats,
  topScorersByTournament,
} from "@/lib/tournament-history";
import { fetchEspnMatches, lookupEspn } from "@/lib/espn";
import { CountUp } from "@/components/CountUp";
import { SinceLastVisit } from "@/components/SinceLastVisit";
import { SectionHeading } from "@/components/SectionHeading";
import { PageHeading } from "@/components/PageHeading";
import { OddsBar } from "@/components/OddsBar";
import { PlayerSearch } from "@/components/PlayerSearch";
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

  // ── ESPN live-data + riktiga odds för fokusmatcherna (tyst fallback) ──────────
  const espn = await fetchEspnMatches(focusMatches.map((m) => m.kickoff));

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

  // Historiska mästerskapsaggregat (statisk data från Wikipedia-skrapningen).
  const histMinuteBuckets = goalsByMinuteBucket();
  const histStats = tournamentStats();
  const histGoalsPerMatch = goalsPerMatchDistribution();
  const histDrama = dramaStats();
  const histScorers = topScorersByTournament(5);

  const teamById = new Map(matches.flatMap((m) => [m.homeTeam, m.awayTeam]).filter(Boolean).map((t) => [t!.id, t!]));
  const teamTag = (id?: string | null) => {
    const t = id ? teamById.get(id) : null;
    return t ? `${t.flag} ${t.code}` : "—";
  };

  // ── Liga-konsensus för fokusmatcher (gruppmatcher) ───────────────────────────
  const focusGroupNums = focusMatches.filter((m) => m.stage === "GROUP").map((m) => m.matchNumber);
  const idByNumber = new Map(matches.map((m) => [m.matchNumber, m.id]));
  const focusMatchIds = focusGroupNums.map((n) => idByNumber.get(n)!).filter(Boolean);
  const leagueUserIds = leagueUsers.map((u) => u.id);
  const consensusPreds =
    focusMatchIds.length && leagueUserIds.length
      ? await prisma.matchPrediction.findMany({
          where: { matchId: { in: focusMatchIds }, userId: { in: leagueUserIds } },
          include: { match: { select: { matchNumber: true } } },
        })
      : [];

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
      <AutoRefresh seconds={60} />

      <PageHeading
        title="Översikt"
      >
      <div className="space-y-6">
      <Klotterplank initialEntries={guestbookInitial} loggedIn={!!user} />

      <SinceLastVisit rank={me?.rank ?? null} points={me?.total ?? 0} resultTimes={resultTimes} />

      {/* ── Turneringspuls ── */}
      <section className="animate-fade-in [animation-fill-mode:both]">
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

      {/* ── Sök spelare ── */}
      <section className="animate-fade-in [animation-delay:120ms] [animation-fill-mode:both]">
        <SectionHeading title="Sök spelare">
          <div className="card p-4">
            <PlayerSearch />
          </div>
        </SectionHeading>
      </section>

      {/* ── Hero: status nu ── */}
      <section className="animate-fade-in [animation-delay:80ms] [animation-fill-mode:both]">
        <div className={`card flex flex-col justify-between gap-3 p-5 ${live.length > 0 ? "animate-live-glow border-red-500/40" : ""}`}>
          {live.length > 0 ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                Live nu{live.length > 1 && <span className="text-slate-500">· {live.length} matcher</span>}
              </div>
              <div className="space-y-2">
                {live.map((m) => (
                  <Link
                    key={m.id}
                    href="/matcher"
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className="truncate text-sm font-medium">
                      {teamTag(m.homeTeamId)} <span className="text-slate-500">vs</span> {teamTag(m.awayTeamId)}
                    </span>
                    <span className="shrink-0 rounded bg-red-500/20 px-2 py-0.5 text-sm font-bold tabular-nums text-red-200">
                      {m.homeScore ?? 0}–{m.awayScore ?? 0}
                    </span>
                  </Link>
                ))}
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

      {/* ── Fokusmatcher + ligakonsensus ── */}
      <section className="animate-fade-in [animation-delay:240ms] [animation-fill-mode:both]">
        <SectionHeading
          title={todays.length ? "Dagens matcher" : "Kommande matcher"}
          action={<Link href="/matcher" className="text-pitch-300 hover:underline">Alla matcher →</Link>}
        >
        {focusMatches.length === 0 ? (
          <p className="card p-4 text-sm text-slate-400">Inga matcher att visa.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {focusMatches.map((m) => {
              const t = tally.get(m.matchNumber);
              const pct = (k: "1" | "X" | "2") => (t && t.total ? Math.round((t[k] / t.total) * 100) : 0);
              const homeName = m.homeTeam ? teamTag(m.homeTeamId) : (m.homeSlot ?? "?");
              const awayName = m.awayTeam ? teamTag(m.awayTeamId) : (m.awaySlot ?? "?");
              const homeCode = m.homeTeam ? (teamMeta.get(m.homeTeamId!)?.code ?? "Hemma") : (m.homeSlot ?? "Hemma");
              const awayCode = m.awayTeam ? (teamMeta.get(m.awayTeamId!)?.code ?? "Borta") : (m.awaySlot ?? "Borta");
              const channel = broadcasterFor(m.channel);
              const odds = m.homeTeam && m.awayTeam
                ? marketOdds(teamMeta.get(m.homeTeamId!)?.fifaRank ?? 99, teamMeta.get(m.awayTeamId!)?.fifaRank ?? 99)
                : null;
              const mp = odds ? marketPct(odds) : null;
              const live = m.homeTeam && m.awayTeam
                ? lookupEspn(espn, teamMeta.get(m.homeTeamId!)?.code, teamMeta.get(m.awayTeamId!)?.code)
                : null;
              const espnOdds = live?.odds ?? null;
              const showScore = live && live.state !== "pre" && live.homeScore != null && live.awayScore != null;
              return (
                <div key={m.id} className="card p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-2">
                      {STAGE_LABEL[m.stage] ?? m.stage}{m.groupId ? ` ${m.groupId}` : ""}
                      {live?.state === "in" && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                          </span>
                          {live.clock ?? "Live"}
                        </span>
                      )}
                      {live?.state === "post" && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">Slut</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {channel && (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${channel.color}`}
                          title={`Sänds på ${channel.name}`}
                        >
                          {channel.domain ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={broadcasterLogo(channel.domain)}
                              alt=""
                              width={14}
                              height={14}
                              loading="lazy"
                              className="h-3.5 w-3.5 rounded-[2px]"
                            />
                          ) : (
                            <span>{channel.icon}</span>
                          )}
                          {channel.short}
                        </span>
                      )}
                      <span>{dateKey(m.kickoff)} {timeStr(m.kickoff)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span className="min-w-0 truncate">{homeName}</span>
                    {showScore ? (
                      <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-base font-extrabold tabular-nums">
                        {live!.homeScore}–{live!.awayScore}
                      </span>
                    ) : (
                      <span className="shrink-0 text-slate-500">vs</span>
                    )}
                    <span className="min-w-0 truncate text-right">{awayName}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {live?.overUnder != null && (
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className="shrink-0 rounded bg-flag-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-flag-300"
                          title={`Spelbolagens gräns: ${live.overUnder} mål`}
                        >
                          {live.overUnder >= 2.75 ? "Målfest väntas" : live.overUnder <= 2.25 ? "Få mål väntas" : "Jämn målbild"} · O/U {live.overUnder}
                        </span>
                      </div>
                    )}
                    {espnOdds && (
                      <OddsBar
                        title="Spelbolagen"
                        hint={
                          espnOdds.homeDec && espnOdds.drawDec && espnOdds.awayDec
                            ? `spelodds ${espnOdds.homeDec.toFixed(2)} / ${espnOdds.drawDec.toFixed(2)} / ${espnOdds.awayDec.toFixed(2)}`
                            : "live från spelbolag"
                        }
                        homeCode={homeCode}
                        awayCode={awayCode}
                        home={espnOdds.homePct}
                        draw={espnOdds.drawPct}
                        away={espnOdds.awayPct}
                        dim
                      />
                    )}
                    {!espnOdds && mp && odds && (
                      <OddsBar
                        title="Modellens odds"
                        hint={`uppskattat ${odds.oddsHome.toFixed(2)} / ${odds.oddsDraw.toFixed(2)} / ${odds.oddsAway.toFixed(2)}`}
                        homeCode={homeCode}
                        awayCode={awayCode}
                        home={mp["1"]}
                        draw={mp.X}
                        away={mp["2"]}
                        dim
                      />
                    )}
                    {t && t.total > 0 ? (
                      <OddsBar
                        title="Så tippar ni i ligan"
                        hint={`${t.total} tips`}
                        homeCode={homeCode}
                        awayCode={awayCode}
                        home={pct("1")}
                        draw={pct("X")}
                        away={pct("2")}
                      />
                    ) : (
                      <p className="text-[11px] text-slate-600">Ligans tips visas för gruppmatcher så fort någon tippat.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </SectionHeading>
      </section>

      {/* ── Resultatkarta (heatmap) ── */}
      <section className="animate-fade-in [animation-delay:320ms] [animation-fill-mode:both]">
        <SectionHeading title="Resultatkarta">
          <ResultsHeatmap teams={heatTeams} />
        </SectionHeading>
      </section>

      {/* ── Målminuter (heatmap) ── */}
      <section className="animate-fade-in [animation-delay:360ms] [animation-fill-mode:both]">
        <SectionHeading title="När faller målen?">
          <GoalMinuteHeatmap
            summary={goalMinutes}
            emptyHint="Inga målminuter inrapporterade än — fylls på när matcherna spelats och detaljer synkats."
          />
        </SectionHeading>
      </section>

      {/* ── Historiska mästerskap (Wikipedia-data) ── */}
      <section className="animate-fade-in [animation-delay:380ms] [animation-fill-mode:both]">
        <SectionHeading title="Så har VM sett ut">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">När görs målen? (per 10 min)</div>
              <GroupedBarChart labels={histMinuteBuckets.labels} series={histMinuteBuckets.series} unit="mål" />
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Mål per match</div>
              <GroupedBarChart labels={histGoalsPerMatch.labels} series={histGoalsPerMatch.series} unit="matcher" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ComparisonBars title="Mål per match" stats={histStats} value={(s) => s.goalsPerMatch} format={(n) => n.toFixed(2)} />
              <ComparisonBars title="Andel mål 2:a halvlek" stats={histStats} value={(s) => 100 - s.firstHalfPct} format={(n) => `${n}%`} hint="resten i 1:a" />
              <ComparisonBars title="Sena mål (76:e+)" stats={histStats} value={(s) => s.lateGoalsPct} format={(n) => `${n}%`} />
              <ComparisonBars title="Straffmål" stats={histStats} value={(s) => s.penalties} format={(n) => `${n}`} />
              <ComparisonBars title="Självmål" stats={histStats} value={(s) => s.ownGoals} format={(n) => `${n}`} />
              <ComparisonBars title="Snittpublik" stats={histStats} value={(s) => s.avgAttendance ?? 0} format={(n) => `${Math.round(n / 1000)}k`} />
            </div>

            {/* Dramatik & kuriosa */}
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dramatik &amp; kuriosa</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ComparisonBars title="Comebacks" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.comebackPct ?? 0} format={(n) => `${n}%`} hint="låg under, förlorade ej" />
              <ComparisonBars title="Sen dramatik (mål 85:e+)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.lateDramaPct ?? 0} format={(n) => `${n}%`} hint="andel matcher" />
              <ComparisonBars title="Straffläggningar" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.shootouts ?? 0} format={(n) => `${n}`} hint="i slutspelet" />
              <ComparisonBars title="Mållösa (0–0)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.goallessPct ?? 0} format={(n) => `${n}%`} />
              <ComparisonBars title="Målrika (5+ mål)" stats={histStats} value={(s) => histDrama.find((d) => d.tournament === s.tournament)?.highScoringPct ?? 0} format={(n) => `${n}%`} />
              <ComparisonBars title="Mål totalt" stats={histStats} value={(s) => s.goals} format={(n) => `${n}`} />
            </div>

            {/* Skyttekungar genom åren */}
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Skyttekungar genom åren</div>
            <TopScorersGrid data={histScorers} />
          </div>
        </SectionHeading>
      </section>

      {/* ── Trender & snackisar ── */}
      <section className="animate-fade-in [animation-delay:400ms] [animation-fill-mode:both]">
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
      <div className="animate-fade-in [animation-delay:440ms] [animation-fill-mode:both]">
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
