"use client";

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
interface Detail {
  id: string;
  displayName: string;
  submitted: boolean;
  isMe: boolean;
  reveal: boolean;
  total: number;
  breakdown?: { groupMatches: number; advancement: number; knockout: number; champion: number };
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
  champion?: Tag | null;
  finalists?: (Tag | null)[];
  semifinalists?: (Tag | null)[];
  groups?: { letter: string; ranking: (Tag | null)[]; matches: { home: Tag | null; away: Tag | null; pred: string }[] }[];
  bracket?: { matchNumber: number; stage: string; stageTitle: string; team1: KoSide; team2: KoSide }[];
}

const tag = (t: Tag | null | undefined) => (t ? `${t.flag} ${t.code}` : "–");

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"];

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
  const total = s.tippedMatches || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  const byStage = (stage: string) => (data.bracket ?? []).filter((m) => m.stage === stage);

  return (
    <div className="space-y-5 p-4">
      {/* Poäng-breakdown */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Poäng</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Gruppspel" value={b.groupMatches} />
          <Stat label="Vidare" value={b.advancement} />
          <Stat label="Slutspel" value={b.knockout} />
          <Stat label="Mästare" value={b.champion} />
        </div>
      </div>

      {/* Tippningsprofil */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tippningsprofil</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Matcher tippade" value={`${s.tippedMatches}/72`} />
          <Stat label="Grupprankningar" value={`${s.groupRankingsSet}/12`} />
          <Stat label="Slutspelsval" value={`${s.bracketWinnersSet}/31`} />
          <Stat label="Exakta resultat" value={s.exactCount} />
          <Stat label="Rätt utfall" value={s.correctOutcomeCount} />
          <Stat label="Träffsäkerhet" value={s.accuracyPct != null ? `${s.accuracyPct}%` : "–"} hint={`av ${s.playedTipped} spelade`} />
          {s.avgGoals != null && <Stat label="Mål/match (tips)" value={s.avgGoals} />}
          {s.totalGoals != null && <Stat label="Mål totalt (tips)" value={s.totalGoals} />}
        </div>
      </div>

      {/* 1X2-fördelning */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Utfallsfördelning</h4>
        <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
          <div style={{ width: `${pct(s.outcomeDist.home)}%` }} className="bg-pitch-500" />
          <div style={{ width: `${pct(s.outcomeDist.draw)}%` }} className="bg-slate-500" />
          <div style={{ width: `${pct(s.outcomeDist.away)}%` }} className="bg-flag-500" />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>Hemma {s.outcomeDist.home} ({pct(s.outcomeDist.home)}%)</span>
          <span>Kryss {s.outcomeDist.draw} ({pct(s.outcomeDist.draw)}%)</span>
          <span>Borta {s.outcomeDist.away} ({pct(s.outcomeDist.away)}%)</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          {s.topScoreline && <span>Vanligaste resultat: <span className="text-slate-200">{s.topScoreline.label}</span> (×{s.topScoreline.count})</span>}
          {s.biggestPrediction && <span>Målrikaste tips: <span className="text-slate-200">{s.biggestPrediction.home}–{s.biggestPrediction.away}</span></span>}
          {s.favoriteTeam?.team && <span>Favoritlag i slutspel: <span className="text-slate-200">{tag(s.favoriteTeam.team)}</span> (×{s.favoriteTeam.count})</span>}
        </div>
      </div>

      {/* Slutspelstips */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white/[0.03] p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Slutspelstips</h4>
          <p className="text-sm">🏆 Mästare: <strong>{tag(data.champion)}</strong>
            {s.championSharePct != null && (
              <span className="ml-2 text-[11px] text-slate-400">{s.championSharePct}% i ligan tippar samma</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-300">Finalister: {data.finalists?.length ? data.finalists.map(tag).join(" · ") : "–"}</p>
          <p className="mt-1 text-sm text-slate-400">Semifinalister: {data.semifinalists?.length ? data.semifinalists.map(tag).join(" · ") : "–"}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Gruppsegrare</h4>
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
