import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isLocked, lockAt } from "@/lib/lock";
import { computeTournamentMetrics } from "@/lib/tournament-metrics";
import { fetchFootballNews, SWEDISH_SOURCES } from "@/lib/news";
import { fetchSocialPosts, JOURNALISTS, avatarUrl, profileUrl } from "@/lib/social";
import { broadcasterFor, broadcasterLogo } from "@/lib/broadcast";
import { marketOdds, marketPct } from "@/lib/odds";
import { scoreGroupMatch } from "@/lib/scoring";
import { Countdown } from "@/components/Countdown";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewsFeed } from "@/components/NewsFeed";
import { ResultsHeatmap, type HeatTeam, type HeatCell, type CellState } from "@/components/ResultsHeatmap";
import { CountUp } from "@/components/CountUp";
import { SuccessRing } from "@/components/SuccessRing";
import { SinceLastVisit } from "@/components/SinceLastVisit";
import { SectionHeading } from "@/components/SectionHeading";

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
  if (!user) redirect("/");

  const tippingMode = user.league.tippingMode as "EXACT" | "X12";

  const [matches, leagueUsers, news, socialPosts] = await Promise.all([
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoff: "asc" },
    }),
    prisma.user.findMany({
      where: { leagueId: user.leagueId },
      include: { score: true },
    }),
    fetchFootballNews(8),
    fetchSocialPosts(8),
  ]);

  const [teams, championPreds] = await Promise.all([
    prisma.team.findMany({
      select: { id: true, code: true, flag: true, name: true, fifaRank: true, recentForm: true },
    }),
    prisma.bracketPrediction.findMany({
      where: { matchNumber: 104, user: { leagueId: user.leagueId } },
      select: { winnerTeamId: true },
    }),
  ]);

  // Spelarens egna tips på avgjorda gruppmatcher — för träffsäkerhetsringen.
  const myGroupPreds = await prisma.matchPrediction.findMany({
    where: {
      userId: user.id,
      match: { status: "FINISHED", stage: "GROUP", homeScore: { not: null }, awayScore: { not: null } },
    },
    include: { match: { select: { homeScore: true, awayScore: true } } },
  });

  let hitPredicted = 0;
  let hitCorrect = 0;
  let hitExact = 0;
  for (const p of myGroupPreds) {
    const hs = p.match.homeScore;
    const as = p.match.awayScore;
    if (hs == null || as == null) continue;
    hitPredicted++;
    if (tippingMode === "X12") {
      const actual = hs > as ? "1" : hs < as ? "2" : "X";
      if (p.predOutcome === actual) hitCorrect++;
    } else if (p.predHome != null && p.predAway != null) {
      const s = scoreGroupMatch({ predHome: p.predHome, predAway: p.predAway }, { homeScore: hs, awayScore: as });
      if (s.correct) hitCorrect++;
      if (s.exact) hitExact++;
    }
  }
  const hitPct = hitPredicted ? Math.round((hitCorrect / hitPredicted) * 100) : 0;

  const now = new Date();
  const locked = isLocked(now);

  // ── Status nu ───────────────────────────────────────────────────────────────
  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED" && m.kickoff > now);
  const nextMatch = upcoming[0] ?? null;
  const finishedSorted = matches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime());
  const lastFinished = finishedSorted[0] ?? null;
  // Tidpunkter då resultat senast uppdaterades — driver "Sedan du var här".
  const resultTimes = finishedSorted.map((m) => m.updatedAt.toISOString());

  // Dagens matcher, annars de närmaste kommande.
  const todayKey = dateKey(now);
  const todays = matches.filter((m) => dateKey(m.kickoff) === todayKey);
  const focusMatches = (todays.length ? todays : upcoming.slice(0, 5)).slice(0, 6);

  // ── Liga-statistik ──────────────────────────────────────────────────────────
  const ranked = leagueUsers
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      submitted: u.submitted,
      total: u.score?.total ?? 0,
      isMe: u.id === user.id,
    }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  let rk = 0;
  let prev: number | null = null;
  const rankedRows = ranked.map((r, i) => {
    if (prev === null || r.total !== prev) rk = i + 1;
    prev = r.total;
    return { ...r, rank: rk };
  });
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

      <SinceLastVisit rank={me?.rank ?? null} points={me?.total ?? 0} resultTimes={resultTimes} />

      {/* ── Turneringspuls ── */}
      <section className="animate-fade-in space-y-3 [animation-fill-mode:both]">
        <SectionHeading title="Turneringspuls" />
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
      </section>

      {/* ── Hero: status nu ── */}
      <section className="grid animate-fade-in gap-4 [animation-delay:80ms] [animation-fill-mode:both] lg:grid-cols-3">
        <div className={`card flex flex-col justify-between gap-3 p-5 lg:col-span-2 ${live.length > 0 ? "animate-live-glow border-red-500/40" : ""}`}>
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

        <div className="card flex flex-col justify-center gap-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Din placering</div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-extrabold tabular-nums">{me ? `#${me.rank}` : "—"}</span>
            <span className="mb-1 text-sm text-slate-400">av {rankedRows.length}</span>
          </div>
          <div className="text-sm text-slate-300">
            {me?.total ?? 0} poäng
            {me && !me.submitted && <span className="ml-2 text-amber-300/80">· ej inlämnat</span>}
          </div>
          {hitPredicted > 0 && (
            <div className="mt-1 border-t border-white/10 pt-3">
              <SuccessRing pct={hitPct} correct={hitCorrect} predicted={hitPredicted} exact={hitExact} />
            </div>
          )}
          {lastFinished && (
            <p className="mt-1 border-t border-white/10 pt-2 text-xs text-slate-500">
              Senast avgjort: {teamTag(lastFinished.homeTeamId)} {lastFinished.homeScore}–{lastFinished.awayScore} {teamTag(lastFinished.awayTeamId)}
            </p>
          )}
        </div>
      </section>

      {/* ── Fotbollsnyheter ── */}
      <div className="animate-fade-in [animation-delay:160ms] [animation-fill-mode:both]">
        <NewsFeed items={news} swedishSources={SWEDISH_SOURCES} />
      </div>

      {/* ── Fokusmatcher + ligakonsensus ── */}
      <section className="animate-fade-in space-y-3 [animation-delay:240ms] [animation-fill-mode:both]">
        <SectionHeading title={todays.length ? "Dagens matcher" : "Kommande matcher"}>
          <Link href="/matcher" className="text-pitch-300 hover:underline">Alla matcher →</Link>
        </SectionHeading>
        {focusMatches.length === 0 ? (
          <p className="card p-4 text-sm text-slate-400">Inga matcher att visa.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {focusMatches.map((m) => {
              const t = tally.get(m.matchNumber);
              const pct = (k: "1" | "X" | "2") => (t && t.total ? Math.round((t[k] / t.total) * 100) : 0);
              const homeName = m.homeTeam ? teamTag(m.homeTeamId) : (m.homeSlot ?? "?");
              const awayName = m.awayTeam ? teamTag(m.awayTeamId) : (m.awaySlot ?? "?");
              const channel = broadcasterFor(m.channel);
              const odds = m.homeTeam && m.awayTeam
                ? marketOdds(teamMeta.get(m.homeTeamId!)?.fifaRank ?? 99, teamMeta.get(m.awayTeamId!)?.fifaRank ?? 99)
                : null;
              const mp = odds ? marketPct(odds) : null;
              return (
                <div key={m.id} className="card p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{STAGE_LABEL[m.stage] ?? m.stage}{m.groupId ? ` ${m.groupId}` : ""}</span>
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
                    <span className="shrink-0 text-slate-500">vs</span>
                    <span className="min-w-0 truncate text-right">{awayName}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {mp && odds && (
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-300">Marknad</span>
                          <span className="tabular-nums text-slate-500">{odds.oddsHome.toFixed(2)} · {odds.oddsDraw.toFixed(2)} · {odds.oddsAway.toFixed(2)}</span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                          <div style={{ width: `${mp["1"]}%` }} className="bg-pitch-500/60" />
                          <div style={{ width: `${mp.X}%` }} className="bg-slate-500/60" />
                          <div style={{ width: `${mp["2"]}%` }} className="bg-flag-500/60" />
                        </div>
                        <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                          <span>1 {mp["1"]}%</span>
                          <span>X {mp.X}%</span>
                          <span>2 {mp["2"]}%</span>
                        </div>
                      </div>
                    )}
                    {t && t.total > 0 ? (
                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-300">Ligan</span>
                          <span className="text-slate-500">{t.total} tips</span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                          <div style={{ width: `${pct("1")}%` }} className="bg-pitch-500" />
                          <div style={{ width: `${pct("X")}%` }} className="bg-slate-500" />
                          <div style={{ width: `${pct("2")}%` }} className="bg-flag-500" />
                        </div>
                        <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
                          <span>1 {pct("1")}%</span>
                          <span>X {pct("X")}%</span>
                          <span>2 {pct("2")}%</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-600">Ligakonsensus visas för gruppmatcher med tips.</p>
                    )}
                    {mp && t && t.total > 0 && (
                      <p className="text-[10px] text-slate-600">Modellbaserade marknadsodds (FIFA-ranking) vs {user.league.name}.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Resultatkarta (heatmap) ── */}
      <section className="animate-fade-in space-y-3 [animation-delay:320ms] [animation-fill-mode:both]">
        <SectionHeading title="Resultatkarta">Alla lag · alla omgångar</SectionHeading>
        <ResultsHeatmap teams={heatTeams} />
      </section>

      {/* ── Trender & snackisar ── */}
      <section className="animate-fade-in space-y-3 [animation-delay:400ms] [animation-fill-mode:both]">
        <SectionHeading title="Trender & snackisar" />
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
      </section>

      {/* ── Snack på X ── */}
      <section className="animate-fade-in space-y-3 [animation-delay:480ms] [animation-fill-mode:both]">
        <SectionHeading title="Snack på X">Fotbolls- &amp; VM-skribenter</SectionHeading>
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
      </section>
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
