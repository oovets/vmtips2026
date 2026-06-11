"use client";

import type { ReactNode } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Tag {
  code: string;
  flag: string;
}
interface KoSide {
  label: string;
  muted: boolean;
  win: boolean;
}
type HitClass = "EXACT" | "DIFF" | "OUTCOME" | "MISS";
interface TimelineEntry {
  matchNumber: number;
  group: string | null;
  home: Tag | null;
  away: Tag | null;
  result: string;
  pred: string;
  points: number | null;
  outcome: HitClass;
}
interface Detail {
  id: string;
  displayName: string;
  submitted: boolean;
  isMe: boolean;
  reveal: boolean;
  total: number;
  breakdown?: { groupMatches: number; advancement: number; knockout: number; champion: number; topScorer: number };
  topScorer?: { player: string; team: Tag | null } | null;
  stats?: {
    tippedMatches: number;
    groupRankingsSet: number;
    bracketWinnersSet: number;
    totalGoals: number | null;
    avgGoals: number | null;
    outcomeDist: { home: number; draw: number; away: number };
    topScoreline: { label: string; count: number } | null;
    biggestPrediction: { home: number; away: number; goals: number } | null;
    drawShare: number;
    exactCount: number;
    correctOutcomeCount: number;
    playedTipped: number;
    accuracyPct: number | null;
    championSharePct: number | null;
    favoriteTeam: { team: Tag | null; count: number } | null;
  };
  rank?: { current: number | null; previous: number | null; leagueSize: number };
  league?: {
    players: number;
    avgTotal: number | null;
    bestTotal: number | null;
    avgExact: number | null;
    avgGroupPoints: number | null;
  };
  timeline?: TimelineEntry[];
  champion?: Tag | null;
  finalists?: (Tag | null)[];
  semifinalists?: (Tag | null)[];
  groups?: { letter: string; ranking: (Tag | null)[]; matches: { home: Tag | null; away: Tag | null; pred: string }[] }[];
  bracket?: { matchNumber: number; stage: string; stageTitle: string; team1: KoSide; team2: KoSide }[];
}

const tag = (t: Tag | null | undefined) => (t ? `${t.flag} ${t.code}` : "–");

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"];

const HIT_META: Record<HitClass, { label: string; bar: string; text: string }> = {
  EXACT: { label: "Exakt", bar: "bg-flag-500", text: "text-flag-500" },
  DIFF: { label: "Rätt målskillnad", bar: "bg-pitch-500", text: "text-pitch-100" },
  OUTCOME: { label: "Rätt utfall", bar: "bg-pitch-700", text: "text-slate-300" },
  MISS: { label: "Miss", bar: "bg-white/10", text: "text-slate-500" },
};

// Svenskt decimalformat med en decimal ("12,5").
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

function parseScoreline(s: string): [number, number] | null {
  const m = s.match(/^(\d+)–(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function PlayerDetail({ id }: { id: string }) {
  const { data, isLoading } = useSWR<Detail>(`/api/leaderboard/${id}`, fetcher);

  if (isLoading || !data) {
    return <div className="p-4 text-sm text-slate-400">Laddar detaljer…</div>;
  }
  if (!data.reveal) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Andra spelares tips visas först när turneringen startat.
      </div>
    );
  }

  const s = data.stats!;
  const b = data.breakdown!;
  const timeline = data.timeline ?? [];
  const league = data.league;
  const hasResults = timeline.length > 0;
  const hasPoints = hasResults && timeline.some((t) => t.points != null);

  const total = s.tippedMatches || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  const byStage = (stage: string) => (data.bracket ?? []).filter((m) => m.stage === stage);

  return (
    <div className="space-y-5 p-4">
      <HeroStrip data={data} />

      {hasResults ? (
        <>
          {hasPoints && <TrendSection timeline={timeline} />}
          <HitSection timeline={timeline} />
          {hasPoints && <CallsSection timeline={timeline} />}
          {league?.avgTotal != null && (
            <LeagueCompareSection
              label={data.isMe ? "Du" : data.displayName}
              total={data.total}
              league={league}
            />
          )}
        </>
      ) : (
        <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-slate-500">
          Trender och analyser visas här när turneringens matcher börjar spelas.
        </p>
      )}

      {/* Poäng-breakdown */}
      <section>
        <SectionTitle>Poäng per kategori</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Gruppspel" value={b.groupMatches} />
          <Stat label="Vidare" value={b.advancement} />
          <Stat label="Slutspel" value={b.knockout} />
          <Stat label="Mästare" value={b.champion} />
          <Stat label="Skyttekung" value={b.topScorer ?? 0} />
        </div>
      </section>

      {data.topScorer && (
        <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
          <span className="text-slate-400">⚽ Skyttekung-tips: </span>
          <strong className="text-slate-200">{data.topScorer.player}</strong>
          {data.topScorer.team && <span className="ml-1 text-slate-400">({tag(data.topScorer.team)})</span>}
        </div>
      )}

      {/* Tippningsprofil */}
      <section>
        <SectionTitle>Tippningsprofil</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Matcher tippade" value={`${s.tippedMatches}/72`} />
          <Stat label="Grupprankningar" value={`${s.groupRankingsSet}/12`} />
          <Stat label="Slutspelsval" value={`${s.bracketWinnersSet}/31`} />
          <Stat label="Exakta resultat" value={s.exactCount} />
          <Stat label="Rätt utfall" value={s.correctOutcomeCount} />
          <Stat label="Träffsäkerhet" value={s.accuracyPct != null ? `${s.accuracyPct}%` : "–"} hint={s.playedTipped ? `av ${s.playedTipped} spelade` : undefined} />
          {s.avgGoals != null && <Stat label="Mål/match (tips)" value={s.avgGoals} />}
          {s.totalGoals != null && <Stat label="Mål totalt (tips)" value={s.totalGoals} />}
        </div>
      </section>

      {/* 1X2-fördelning */}
      <section>
        <SectionTitle>Utfallsfördelning</SectionTitle>
        <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
          <div style={{ width: `${pct(s.outcomeDist.home)}%` }} className="bg-pitch-500" />
          <div style={{ width: `${pct(s.outcomeDist.draw)}%` }} className="bg-slate-500" />
          <div style={{ width: `${pct(s.outcomeDist.away)}%` }} className="bg-flag-500" />
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] text-slate-400">
          <span className="whitespace-nowrap">Hemma {s.outcomeDist.home} ({pct(s.outcomeDist.home)}%)</span>
          <span className="whitespace-nowrap">Kryss {s.outcomeDist.draw} ({pct(s.outcomeDist.draw)}%)</span>
          <span className="whitespace-nowrap">Borta {s.outcomeDist.away} ({pct(s.outcomeDist.away)}%)</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          {s.topScoreline && <span>Vanligaste resultat: <span className="text-slate-200">{s.topScoreline.label}</span> (×{s.topScoreline.count})</span>}
          {s.biggestPrediction && <span>Målrikaste tips: <span className="text-slate-200">{s.biggestPrediction.home}–{s.biggestPrediction.away}</span></span>}
          {s.favoriteTeam?.team && <span>Favoritlag i slutspel: <span className="text-slate-200">{tag(s.favoriteTeam.team)}</span> (×{s.favoriteTeam.count})</span>}
        </div>
      </section>

      {/* Slutspelstips */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white/[0.03] p-3">
          <SectionTitle>Slutspelstips</SectionTitle>
          <p className="text-sm">🏆 Mästare: <strong>{tag(data.champion)}</strong>
            {s.championSharePct != null && (
              <span className="ml-2 text-[11px] text-slate-400">{s.championSharePct}% i ligan tippar samma</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-300">Finalister: {data.finalists?.length ? data.finalists.map(tag).join(" · ") : "–"}</p>
          <p className="mt-1 text-sm text-slate-400">Semifinalister: {data.semifinalists?.length ? data.semifinalists.map(tag).join(" · ") : "–"}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-3">
          <SectionTitle>Gruppsegrare</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
            {(data.groups ?? []).map((g) => (
              <div key={g.letter}>
                <span className="text-slate-500">{g.letter}:</span> {tag(g.ranking[0])}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gruppspel detaljerat */}
      <details className="rounded-lg bg-white/[0.03]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gruppspel — alla tips
        </summary>
        <div className="grid gap-3 p-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {(data.groups ?? []).map((g) => (
            <div key={g.letter} className="rounded-md bg-white/[0.02] p-2">
              <div className="mb-1 text-xs font-bold">Grupp {g.letter}</div>
              {g.ranking.length > 0 && (
                <ol className="mb-2 space-y-0.5 text-[11px]">
                  {g.ranking.map((t, i) => (
                    <li key={i} className={i < 2 ? "text-pitch-100" : "text-slate-500"}>
                      <span className="mr-1 tabular-nums text-slate-600">{i + 1}.</span>{tag(t)}
                    </li>
                  ))}
                </ol>
              )}
              <table className="w-full text-[11px]">
                <tbody>
                  {g.matches.map((m, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="py-0.5 pr-1 text-right text-slate-300">{tag(m.home)}</td>
                      <td className="px-1 py-0.5 text-center font-bold tabular-nums">{m.pred}</td>
                      <td className="py-0.5 pl-1 text-slate-300">{tag(m.away)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </details>

      {/* Slutspelsträd */}
      <details className="rounded-lg bg-white/[0.03]">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Slutspelsträd
        </summary>
        <div className="space-y-3 p-3 pt-0">
          {STAGE_ORDER.map((stage) => {
            const ms = byStage(stage);
            if (!ms.length) return null;
            return (
              <div key={stage} className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ms[0].stageTitle}</div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {ms.map((m) => (
                    <div key={m.matchNumber} className="rounded-md bg-white/[0.02] p-1.5 text-[11px]">
                      <div className="mb-0.5 text-[9px] text-slate-600">#{m.matchNumber}</div>
                      <KoLine {...m.team1} />
                      <KoLine {...m.team2} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

/* ---------- Hero: placering, poäng och form i ett svep ---------- */

function HeroStrip({ data }: { data: Detail }) {
  const s = data.stats!;
  const rank = data.rank;
  const league = data.league;
  // Snittjämförelser är meningslösa innan några matcher avgjorts (alla har 0).
  const started = (data.timeline?.length ?? 0) > 0;

  const delta =
    rank?.current != null && rank?.previous != null ? rank.previous - rank.current : null;
  const trend =
    delta == null || delta === 0
      ? { symbol: "→", cls: "text-slate-500", text: "oförändrad" }
      : delta > 0
        ? { symbol: "▲", cls: "text-emerald-400", text: `+${delta}` }
        : { symbol: "▼", cls: "text-red-400", text: `${delta}` };

  const vsAvg = league?.avgTotal != null ? data.total - league.avgTotal : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <HeroCard
        label="Placering"
        value={rank?.current != null ? `${rank.current}` : "–"}
        sub={
          rank?.current != null ? (
            <span>
              <span className={trend.cls}>{trend.symbol} {trend.text}</span>
              <span className="text-slate-600"> · av {rank.leagueSize}</span>
            </span>
          ) : undefined
        }
      />
      <HeroCard
        label="Totalpoäng"
        value={data.total}
        sub={
          started && vsAvg != null ? (
            <span className={vsAvg >= 0 ? "text-emerald-400" : "text-red-400"}>
              {vsAvg >= 0 ? "+" : "−"}{fmt1(Math.abs(vsAvg))} mot snittet
            </span>
          ) : undefined
        }
      />
      <HeroCard
        label="Exakta resultat"
        value={s.exactCount}
        sub={started && league?.avgExact != null ? <span className="text-slate-500">ligasnitt {fmt1(league.avgExact)}</span> : undefined}
      />
      <HeroCard
        label="Träffsäkerhet"
        value={s.accuracyPct != null ? `${s.accuracyPct}%` : "–"}
        sub={s.playedTipped ? <span className="text-slate-500">av {s.playedTipped} spelade</span> : undefined}
      />
    </div>
  );
}

function HeroCard({ label, value, sub }: { label: string; value: number | string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      {sub && <div className="mt-0.5 text-[10px]">{sub}</div>}
    </div>
  );
}

/* ---------- Poängtrend: kumulativ kurva över spelade matcher ---------- */

function TrendSection({ timeline }: { timeline: TimelineEntry[] }) {
  const cumulative: number[] = [];
  let acc = 0;
  for (const t of timeline) {
    acc += t.points ?? 0;
    cumulative.push(acc);
  }
  const max = Math.max(acc, 1);
  const n = cumulative.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 34 - (v / max) * 30;
  const linePts = cumulative.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPath = `M0,36 L${cumulative.map((v, i) => `${x(i)},${y(v)}`).join(" L")} L100,36 Z`;

  const last5 = timeline.slice(-5);
  const formPts = last5.reduce((a, t) => a + (t.points ?? 0), 0);

  return (
    <section>
      <SectionTitle>Poängtrend</SectionTitle>
      <div className="rounded-lg bg-white/[0.03] p-3">
        <div className="mb-1 flex items-baseline justify-between text-[11px] text-slate-400">
          <span>{n} spelade matcher med tips</span>
          <span>
            Form (senaste {last5.length}): <span className="font-semibold text-slate-200">{formPts}p</span>
          </span>
        </div>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Kumulativ poängutveckling">
          <path d={areaPath} fill="rgba(0,106,167,0.25)" />
          {n > 1 ? (
            <polyline points={linePts} fill="none" stroke="#fecc02" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          ) : (
            <circle cx={x(0)} cy={y(cumulative[0])} r="1.5" fill="#fecc02" />
          )}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-slate-600">
          <span>Match 1</span>
          <span className="font-semibold text-flag-500">{acc}p från gruppspelet</span>
        </div>
        {/* Match-för-match: färgkodade segment i kronologisk ordning */}
        <div className="mt-2 flex h-2 gap-px overflow-hidden rounded-full">
          {timeline.map((t) => (
            <div
              key={t.matchNumber}
              className={`min-w-0 flex-1 ${HIT_META[t.outcome].bar}`}
              title={`${tag(t.home)} ${t.result} ${tag(t.away)} · tips ${t.pred}${t.points != null ? ` · ${t.points}p` : ""}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Träffbild: exakt / målskillnad / utfall / miss ---------- */

function HitSection({ timeline }: { timeline: TimelineEntry[] }) {
  const counts: Record<HitClass, number> = { EXACT: 0, DIFF: 0, OUTCOME: 0, MISS: 0 };
  for (const t of timeline) counts[t.outcome]++;
  const n = timeline.length;
  const order: HitClass[] = ["EXACT", "DIFF", "OUTCOME", "MISS"];

  // Träffar per grupp (bara grupper med spelade, tippade matcher).
  const byGroup = new Map<string, { hits: number; total: number }>();
  for (const t of timeline) {
    if (!t.group) continue;
    const g = byGroup.get(t.group) ?? { hits: 0, total: 0 };
    g.total++;
    if (t.outcome !== "MISS") g.hits++;
    byGroup.set(t.group, g);
  }
  const groupRows = [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section>
      <SectionTitle>Träffbild</SectionTitle>
      <div className="rounded-lg bg-white/[0.03] p-3">
        <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
          {order.map((k) =>
            counts[k] > 0 ? (
              <div key={k} style={{ width: `${(counts[k] / n) * 100}%` }} className={HIT_META[k].bar} />
            ) : null,
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {order.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-slate-400">
              <span className={`h-2 w-2 rounded-sm ${HIT_META[k].bar}`} />
              {HIT_META[k].label}: <span className={`font-semibold ${HIT_META[k].text}`}>{counts[k]}</span>
              <span className="text-slate-600">({Math.round((counts[k] / n) * 100)}%)</span>
            </span>
          ))}
        </div>
        {groupRows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {groupRows.map(([letter, g]) => (
              <span
                key={letter}
                className={`rounded-md px-2 py-0.5 text-[11px] tabular-nums ${
                  g.hits === g.total
                    ? "bg-pitch-500/25 text-pitch-100"
                    : g.hits === 0
                      ? "bg-white/[0.04] text-slate-500"
                      : "bg-white/[0.06] text-slate-300"
                }`}
                title={`Grupp ${letter}: ${g.hits} rätt utfall av ${g.total} spelade`}
              >
                {letter} {g.hits}/{g.total}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Bästa och sämsta tips hittills ---------- */

function CallsSection({ timeline }: { timeline: TimelineEntry[] }) {
  const best = timeline
    .filter((t) => (t.points ?? 0) > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3);

  const missError = (t: TimelineEntry): number => {
    const p = parseScoreline(t.pred);
    const r = parseScoreline(t.result);
    if (!p || !r) return 0;
    return Math.abs(p[0] - r[0]) + Math.abs(p[1] - r[1]);
  };
  const worst = timeline
    .filter((t) => t.outcome === "MISS")
    .sort((a, b) => missError(b) - missError(a))
    .slice(0, 3);

  if (!best.length && !worst.length) return null;

  return (
    <section>
      <SectionTitle>Bästa &amp; sämsta tips</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {best.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-1.5 text-[11px] font-semibold text-pitch-100">Bästa träffar</div>
            <ul className="space-y-1">
              {best.map((t) => (
                <CallRow key={t.matchNumber} t={t} badge={`+${t.points}p`} badgeCls={t.outcome === "EXACT" ? "text-flag-500" : "text-pitch-100"} />
              ))}
            </ul>
          </div>
        )}
        {worst.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-400">Största missar</div>
            <ul className="space-y-1">
              {worst.map((t) => (
                <CallRow key={t.matchNumber} t={t} badge="0p" badgeCls="text-slate-500" />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function CallRow({ t, badge, badgeCls }: { t: TimelineEntry; badge: string; badgeCls: string }) {
  return (
    <li className="flex items-center justify-between gap-2 text-[11px]">
      <span className="min-w-0 truncate text-slate-300">
        {tag(t.home)} <span className="font-bold tabular-nums text-slate-100">{t.result}</span> {tag(t.away)}
        <span className="ml-1.5 text-slate-500">tips {t.pred}</span>
      </span>
      <span className={`shrink-0 font-bold tabular-nums ${badgeCls}`}>{badge}</span>
    </li>
  );
}

/* ---------- Jämförelse mot ligan ---------- */

function LeagueCompareSection({
  label,
  total,
  league,
}: {
  label: string;
  total: number;
  league: NonNullable<Detail["league"]>;
}) {
  const rows = [
    { label, value: total, bar: "bg-flag-500", text: "text-slate-100" },
    { label: "Ligasnitt", value: league.avgTotal ?? 0, bar: "bg-pitch-500", text: "text-slate-300" },
    { label: "Ledaren", value: league.bestTotal ?? 0, bar: "bg-pitch-700", text: "text-slate-300" },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <section>
      <SectionTitle>Jämfört med ligan</SectionTitle>
      <div className="space-y-1.5 rounded-lg bg-white/[0.03] p-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 shrink-0 truncate text-slate-400">{r.label}</span>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
              <div style={{ width: `${(r.value / max) * 100}%` }} className={`h-full rounded-full ${r.bar}`} />
            </div>
            <span className={`w-10 shrink-0 text-right font-semibold tabular-nums ${r.text}`}>{fmt1(r.value)}</span>
          </div>
        ))}
        <p className="pt-0.5 text-[10px] text-slate-600">{league.players} spelare i ligan</p>
      </div>
    </section>
  );
}

/* ---------- Byggstenar ---------- */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
      <span className="h-3 w-0.5 rounded-full bg-pitch-500" aria-hidden />
      {children}
    </h4>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-2.5 text-center">
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      {hint && <div className="text-[9px] text-slate-600">{hint}</div>}
    </div>
  );
}

function KoLine({ label, muted, win }: KoSide) {
  return (
    <div className={`flex items-center justify-between gap-1 ${win ? "font-bold text-pitch-200" : muted ? "text-slate-600" : "text-slate-200"}`}>
      <span className="min-w-0 truncate">{label}</span>
      {win && <span className="shrink-0 text-pitch-400">✓</span>}
    </div>
  );
}
