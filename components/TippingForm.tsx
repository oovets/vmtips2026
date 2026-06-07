"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  computeGroupStandings,
  bestThirds,
  type ResultRef,
  type Standing,
} from "@/lib/standings";
import { resolveR32Participants, buildValidatedTree, completeBracket } from "@/lib/bracket";
import { BRACKET } from "@/lib/bracket-template";
import { BracketBuilder } from "./BracketBuilder";
import { TeamLabel, type TeamLite, type FormEntry } from "./TeamPill";
import { DiceIcon } from "./DiceIcon";

interface GroupMatchLite {
  matchNumber: number;
  groupId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
}
interface Props {
  teams: TeamLite[];
  groupMatches: GroupMatchLite[];
  initial: {
    scores: Record<number, { h: number; a: number }>;
    outcomes: Record<number, "1" | "X" | "2">;
    koWinners: Record<number, string>;
    topScorer: { player: string; teamId: string };
  };
  locked: boolean;
  submitted: boolean;
  tippingMode: "EXACT" | "X12";
}

const LETTERS = "ABCDEFGHIJKL".split("");
type ScoreVal = { h: number | null; a: number | null };

export function TippingForm({ teams, groupMatches, initial, locked, submitted, tippingMode }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"group" | "ko">("group");
  const [scores, setScores] = useState<Record<number, ScoreVal>>(() => {
    const s: Record<number, ScoreVal> = {};
    for (const [n, v] of Object.entries(initial.scores)) s[Number(n)] = { h: v.h, a: v.a };
    return s;
  });
  const [outcomes, setOutcomes] = useState<Record<number, "1" | "X" | "2">>(initial.outcomes ?? {});
  const [koWinners, setKoWinners] = useState<Record<number, string>>(initial.koWinners);
  const [topScorerPlayer, setTopScorerPlayer] = useState<string>(initial.topScorer?.player ?? "");
  const [topScorerTeamId, setTopScorerTeamId] = useState<string>(initial.topScorer?.teamId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  // När AI fyllt gruppspelet väntar vi på att standings/R32 ska räknas om innan
  // vi automatiskt fyller slutspelsträdet.
  const [pendingAiKo, setPendingAiKo] = useState(false);

  // Type "ai" anywhere (not in an input) to reveal the AI button
  useEffect(() => {
    let buf = "";
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      buf = (buf + e.key.toLowerCase()).slice(-2);
      if (buf === "ai") setAiVisible((v) => !v);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const teamsSorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name, "sv")), [teams]);

  const groups = useMemo(
    () =>
      LETTERS.map((letter) => ({
        letter,
        teams: teams.filter((t) => t.groupId === letter),
        matches: groupMatches
          .filter((m) => m.groupId === letter)
          .sort((a, b) => a.matchNumber - b.matchNumber),
      })),
    [teams, groupMatches],
  );

  // Resultat för standings-beräkning (endast ifyllda matcher)
  const resultRefs = useMemo<ResultRef[]>(() => {
    const out: ResultRef[] = [];
    for (const m of groupMatches) {
      if (tippingMode === "X12") {
        const o = outcomes[m.matchNumber];
        if (o) {
          // Simulate a plausible score for standings calculation (1-0, 0-0, 0-1)
          const h = o === "1" ? 1 : 0;
          const a = o === "2" ? 1 : 0;
          out.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: h, awayScore: a });
        }
      } else {
        const s = scores[m.matchNumber];
        if (s && s.h != null && s.a != null) {
          out.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: s.h, awayScore: s.a });
        }
      }
    }
    return out;
  }, [scores, outcomes, groupMatches, tippingMode]);

  const standingsMap = useMemo<Record<string, Standing[]>>(() => {
    const map: Record<string, Standing[]> = {};
    for (const g of groups) {
      const teamRefs = g.teams.map((t) => ({ id: t.id, groupId: t.groupId, fifaRank: t.fifaRank }));
      const groupRefs = resultRefs.filter((r) => g.teams.some((t) => t.id === r.homeTeamId));
      map[g.letter] = computeGroupStandings(teamRefs, groupRefs);
    }
    return map;
  }, [groups, resultRefs]);

  const groupFilled = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of groups) {
      out[g.letter] = g.matches.filter((m) => {
        if (tippingMode === "X12") return outcomes[m.matchNumber] != null;
        const s = scores[m.matchNumber];
        return s && s.h != null && s.a != null;
      }).length;
    }
    return out;
  }, [groups, scores, outcomes, tippingMode]);

  const allComplete = groups.every((g) => groupFilled[g.letter] === 6);
  const filledTotal = Object.values(groupFilled).reduce((a, b) => a + b, 0);

  const thirds = useMemo(() => (allComplete ? bestThirds(standingsMap) : []), [allComplete, standingsMap]);
  const r32 = useMemo(
    () => (allComplete ? resolveR32Participants(standingsMap, thirds) : {}),
    [allComplete, standingsMap, thirds],
  );
  const tree = useMemo(() => buildValidatedTree(r32, koWinners), [r32, koWinners]);
  const koPicked = Object.keys(tree.winners).length;
  // Slutspelet måste vara ifyllt — utom bronsmatchen (#103), som inte går att tippa
  // och inte ger poäng. Antal val som krävs = alla slutspelsmatcher minus 3:e-platsen.
  const koRequired = BRACKET.filter((b) => b.stage !== "THIRD").length;
  const koComplete = koPicked >= koRequired;
  const canSubmit = allComplete && koComplete;

  function setScore(n: number, side: "h" | "a", raw: string) {
    const v = raw === "" ? null : Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
    setScores((prev) => ({ ...prev, [n]: { ...prev[n], [side]: v } as ScoreVal }));
    setMsg(null);
  }

  function pickWinner(n: number, teamId: string) {
    setKoWinners((prev) => {
      const next = { ...prev };
      if (next[n] === teamId) delete next[n];
      else next[n] = teamId;
      return next;
    });
    setMsg(null);
  }

  // Slumpat resultat, viktat mot låga mål (realistiskt)
  function randomScore() {
    const table = [0, 0, 1, 1, 1, 2, 2, 3];
    const g = () => table[Math.floor(Math.random() * table.length)];
    return { h: g(), a: g() };
  }

  // Slumpad vinnare, lätt viktad efter FIFA-ranking (favorit oftare men skrällar möjliga)
  function randomWinner(homeId: string, awayId: string): string {
    const hr = teamsById[homeId]?.fifaRank ?? 50;
    const ar = teamsById[awayId]?.fifaRank ?? 50;
    const pHome = 1 / hr / (1 / hr + 1 / ar);
    return Math.random() < pHome ? homeId : awayId;
  }

  // Fyll tomma gruppmatcher med slumpade resultat/utfall
  function randomizeScores(onlyLetter?: string, force = false) {
    if (tippingMode === "X12") {
      setOutcomes((prev) => {
        const next = { ...prev };
        for (const m of groupMatches) {
          if (onlyLetter && m.groupId !== onlyLetter) continue;
          if (!force && next[m.matchNumber]) continue;
          const hr = teams.find((t) => t.id === m.homeTeamId)?.fifaRank ?? 50;
          const ar = teams.find((t) => t.id === m.awayTeamId)?.fifaRank ?? 50;
          const total = 1 / hr + 1 / ar;
          const r = Math.random();
          const pHome = (1 / hr) / total * 0.7;
          const pDraw = 0.25;
          next[m.matchNumber] = r < pHome ? "1" : r < pHome + pDraw ? "X" : "2";
        }
        return next;
      });
    } else {
      setScores((prev) => {
        const next = { ...prev };
        for (const m of groupMatches) {
          if (onlyLetter && m.groupId !== onlyLetter) continue;
          if (!force && prev[m.matchNumber]?.h != null) continue;
          next[m.matchNumber] = randomScore();
        }
        return next;
      });
    }
    setMsg(null);
  }

  // Slumpa om ALLA (inkl redan ifyllda)
  function reRandomize(onlyLetter?: string) {
    randomizeScores(onlyLetter, true);
  }

  async function analyzeAndApply() {
    setAnalyzing(true);
    setMsg("Analyserar lag och form med AI…");
    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`AI-analys misslyckades: ${data.error}`);
        return;
      }
      const preds: Array<{ matchNumber: number; home: number; away: number; outcome: "1" | "X" | "2" }> =
        data.predictions ?? [];
      if (tippingMode === "X12") {
        setOutcomes((prev) => {
          const next = { ...prev };
          for (const p of preds) next[p.matchNumber] = p.outcome;
          return next;
        });
      } else {
        setScores((prev) => {
          const next = { ...prev };
          for (const p of preds) next[p.matchNumber] = { h: p.home, a: p.away };
          return next;
        });
      }
      setMsg(`AI-förslag tillämpade på ${preds.length} matcher.`);
      // Fyll även slutspelsträdet när gruppspelet är klart (sker i effekten nedan
      // när standings/R32 räknats om från de nya gruppresultaten).
      setPendingAiKo(true);
    } catch {
      setMsg("Nätverksfel vid AI-analys.");
    } finally {
      setAnalyzing(false);
    }
  }

  // Slumpa vinnare för återstående slutspelsmatcher (cascade upp till final)
  function randomizeBracketRest() {
    setKoWinners((prev) => completeBracket(r32, prev, randomWinner, false) as Record<number, string>);
    setMsg(null);
  }

  // När AI fyllt gruppspelet och standings/R32 räknats om: fyll hela slutspelsträdet
  // automatiskt (FIFA-viktade vinnare, skrällar möjliga). Körs bara en gång per AI-analys.
  useEffect(() => {
    if (!pendingAiKo) return;
    if (!allComplete) return; // vänta tills alla grupper är ifyllda
    setKoWinners(completeBracket(r32, {}, randomWinner, true) as Record<number, string>);
    setPendingAiKo(false);
    setMsg("AI-förslag tillämpade på både gruppspel och slutspel.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiKo, allComplete, r32]);

  async function save(submit: boolean) {
    if (submit && !canSubmit) {
      setTab(!allComplete ? "group" : "ko");
      setMsg(
        !allComplete
          ? `Fyll i alla gruppmatcher först (${filledTotal}/72).`
          : `Slutför slutspelsträdet först (${koPicked}/${koRequired} val).`,
      );
      return;
    }
    setSaving(true);
    setMsg(null);
    const matchPreds =
      tippingMode === "X12"
        ? Object.entries(outcomes).map(([n, o]) => ({ matchNumber: Number(n), predOutcome: o }))
        : Object.entries(scores)
            .filter(([, v]) => v.h != null && v.a != null)
            .map(([n, v]) => ({ matchNumber: Number(n), predHome: v.h!, predAway: v.a! }));

    const groupPreds = groups
      .filter((g) => groupFilled[g.letter] === 6)
      .map((g) => {
        const st = standingsMap[g.letter];
        return {
          groupId: g.letter,
          rank1TeamId: st[0].teamId,
          rank2TeamId: st[1].teamId,
          rank3TeamId: st[2].teamId,
          rank4TeamId: st[3].teamId,
        };
      });

    const bracketPreds = BRACKET.map((b) => ({
      matchNumber: b.matchNumber,
      team1Id: tree.resolved[b.matchNumber]?.homeTeamId ?? null,
      team2Id: tree.resolved[b.matchNumber]?.awayTeamId ?? null,
      winnerTeamId: tree.winners[b.matchNumber] ?? null,
    }));

    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit,
          matchPreds,
          groupPreds,
          bracketPreds,
          topScorerPlayer: topScorerPlayer.trim() || null,
          topScorerTeamId: topScorerTeamId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Kunde inte spara");
      } else {
        setMsg(submit ? "Inlämnat! Lycka till!" : "Sparat som utkast.");
        if (submit) router.refresh();
      }
    } catch {
      setMsg("Nätverksfel");
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <div className="space-y-6">
        <Header submitted={submitted} locked />
        <div className="card p-6 text-center text-slate-300">
          <p className="text-lg">Tipsen är låsta — turneringen har börjat.</p>
          <p className="mt-2 text-sm text-slate-400">
            Följ din progress på <a className="text-pitch-400 underline" href="/leaderboard">topplistan</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header submitted={submitted} locked={false} />

      {/* Statusrad under headern */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
        <span>
          Gruppmatcher: <strong className="text-slate-200">{filledTotal}/72</strong>
        </span>
        <span>
          Slutspelsval: <strong className="text-slate-200">{koPicked}/{koRequired}</strong>
        </span>
        {!allComplete && (
          <span className="text-xs text-amber-300">Fyll i alla gruppmatcher för slutspelet ⤵</span>
        )}
      </div>

      {/* Frivilligt: VM:s skyttekung. Påverkar inte inlämningskravet. */}
      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">⚽ VM:s skyttekung</h2>
          <span className="chip bg-white/5 text-[10px] text-slate-400">frivilligt</span>
          <span className="ml-auto text-[11px] text-slate-500">Rätt gissning ger bonuspoäng</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={topScorerPlayer}
            onChange={(e) => { setTopScorerPlayer(e.target.value); setMsg(null); }}
            placeholder="Spelarnamn, t.ex. Kylian Mbappé"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-night-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-pitch-500/60 focus:outline-none"
            maxLength={80}
          />
          <select
            value={topScorerTeamId}
            onChange={(e) => { setTopScorerTeamId(e.target.value); setMsg(null); }}
            className="shrink-0 rounded-lg border border-white/10 bg-night-900/80 px-3 py-2 text-sm text-slate-100 focus:border-pitch-500/60 focus:outline-none sm:w-52"
          >
            <option value="">Lag (valfritt)</option>
            {teamsSorted.map((t) => (
              <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
            ))}
          </select>
        </div>
        {topScorerPlayer.trim() && (
          <button
            onClick={() => { setTopScorerPlayer(""); setTopScorerTeamId(""); setMsg(null); }}
            className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-300"
          >
            Rensa skyttekung-tips
          </button>
        )}
      </div>

      {/* Flikar + knappar på samma rad (sticky) */}
      <div className="sticky top-[60px] z-20 flex flex-wrap items-center gap-2 border-b border-white/10 bg-night-950/95 pb-3 pt-1 backdrop-blur">
        <div className="flex rounded-xl bg-night-900/80 p-1 gap-1">
          <button
            onClick={() => setTab("group")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "group" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"}`}
          >
            Gruppspel
          </button>
          <button
            onClick={() => setTab("ko")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "ko" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"}`}
          >
            Slutspel
          </button>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          {aiVisible && (
            <button
              onClick={analyzeAndApply}
              disabled={analyzing || saving}
              className="btn-ghost btn-sm flex items-center gap-1"
              title="Låt AI föreslå resultat baserat på FIFA-ranking och lagform"
            >
              {analyzing ? (
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
              ) : null}
              AI
            </button>
          )}
          <Link
            href="/mitt-lag/export"
            className="btn-ghost btn-sm"
            title="Exportera ditt tips som PDF"
          >
            PDF
          </Link>
          <button onClick={() => save(false)} disabled={saving} className="btn-ghost btn-sm">
            Spara utkast
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || !canSubmit}
            title={
              canSubmit
                ? "Lämna in ditt tips"
                : !allComplete
                  ? `Fyll i alla gruppmatcher först (${filledTotal}/72)`
                  : `Slutför slutspelsträdet först (${koPicked}/${koRequired})`
            }
            className="btn-primary btn-sm"
          >
            Lämna in
          </button>
        </div>
      </div>

      {msg && <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-pitch-200">{msg}</p>}

      {tab === "group" ? (
        <>
          {filledTotal < 72 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-slate-400">
              <span>Vet du inte? Slumpa alla tomma.</span>
              <button onClick={() => randomizeScores()} className="btn-icon shrink-0" title="Slumpa alla tomma">
                <DiceIcon />
              </button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <GroupCard
                key={g.letter}
                letter={g.letter}
                matches={g.matches}
                teamsById={teamsById}
                standings={standingsMap[g.letter]}
                scores={scores}
                outcomes={outcomes}
                tippingMode={tippingMode}
                onScore={setScore}
                onOutcome={(n, o) => { setOutcomes((prev) => ({ ...prev, [n]: o })); setMsg(null); }}
                onRandomize={() => randomizeScores(g.letter)}
                onReRandomize={() => reRandomize(g.letter)}
                complete={groupFilled[g.letter] === 6}
              />
            ))}
          </div>
        </>
      ) : allComplete ? (
        <BracketBuilder
          teamsById={teamsById}
          resolved={tree.resolved}
          winners={tree.winners}
          onPick={pickWinner}
          randomWinner={randomWinner}
          onRandomizeRest={randomizeBracketRest}
        />
      ) : (
        <div className="card p-6 text-center text-slate-300">
          Fyll i resultatet i <strong>alla 72 gruppmatcher</strong> så genereras ditt slutspelsträd
          automatiskt här. ({filledTotal}/72 klara)
        </div>
      )}
    </div>
  );
}

function Header({ submitted, locked }: { submitted: boolean; locked: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold">Mitt tips</h1>
        <p className="text-sm text-slate-400">Tippa alla matcher och bygg ditt slutspelsträd.</p>
      </div>
      {submitted && !locked && (
        <span className="chip bg-pitch-500/15 text-pitch-200">Inlämnat (kan ändras tills låsning)</span>
      )}
    </div>
  );
}

function GroupCard({
  letter,
  matches,
  teamsById,
  standings,
  scores,
  outcomes,
  tippingMode,
  onScore,
  onOutcome,
  onRandomize,
  onReRandomize,
  complete,
}: {
  letter: string;
  matches: GroupMatchLite[];
  teamsById: Record<string, TeamLite>;
  standings: Standing[];
  scores: Record<number, ScoreVal>;
  outcomes: Record<number, "1" | "X" | "2">;
  tippingMode: "EXACT" | "X12";
  onScore: (n: number, side: "h" | "a", v: string) => void;
  onOutcome: (n: number, o: "1" | "X" | "2") => void;
  onRandomize: () => void;
  onReRandomize: () => void;
  complete: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Grupp {letter}</h2>
        <div className="flex items-center gap-1.5">
          {complete && <span className="chip bg-pitch-500/15 text-pitch-200 text-[10px]">klar</span>}
          <button
            onClick={onRandomize}
            className="btn-icon"
            title="Slumpa tomma matcher"
          >
            <DiceIcon />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {matches.map((m) => {
          const home = teamsById[m.homeTeamId];
          const away = teamsById[m.awayTeamId];

          if (tippingMode === "X12") {
            const picked = outcomes[m.matchNumber];
            return (
              <div key={m.matchNumber} className="flex items-center gap-1.5 text-sm">
                <div className="flex-1 min-w-0 text-right">
                  <TeamLabel team={home} align="right" />
                </div>
                <div className="flex gap-0.5 shrink-0">
                  {(["1", "X", "2"] as const).map((o) => (
                    <button
                      key={o}
                      onClick={() => onOutcome(m.matchNumber, o)}
                      className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                        picked === o
                          ? o === "1" ? "bg-pitch-500 text-white" : o === "X" ? "bg-slate-500 text-white" : "bg-pitch-700 text-white"
                          : "bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <TeamLabel team={away} align="left" />
                </div>
              </div>
            );
          }

          const s = scores[m.matchNumber] ?? { h: null, a: null };
          return (
            <div key={m.matchNumber} className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-1.5">
              <div className="min-w-0 text-sm"><TeamLabel team={home} align="right" /></div>
              <input
                aria-label={`${home?.name} mål`}
                className="score-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.h ?? ""}
                onChange={(e) => onScore(m.matchNumber, "h", e.target.value)}
              />
              <span className="text-slate-500">–</span>
              <input
                aria-label={`${away?.name} mål`}
                className="score-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.a ?? ""}
                onChange={(e) => onScore(m.matchNumber, "a", e.target.value)}
              />
              <div className="min-w-0 text-sm"><TeamLabel team={away} align="left" /></div>
            </div>
          );
        })}
      </div>

      {/* Lagform - referens vid tippning */}
      {standings.some((st) => (teamsById[st.teamId]?.recentForm ?? []).length > 0) && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lagform</p>
          <div className="space-y-0.5">
            {standings.map((st) => {
              const t = teamsById[st.teamId];
              const form: FormEntry[] = t?.recentForm ?? [];
              return (
                <div key={st.teamId} className="flex items-center gap-2">
                  <span className="w-[4.5rem] shrink-0 text-xs font-medium text-slate-300">{t?.flag} {t?.code}</span>
                  <span className="shrink-0 text-[10px] font-medium text-slate-400">FIFA rank {t?.fifaRank}</span>
                  <span className="ml-auto flex gap-0.5">
                    {form.length > 0
                      ? form.slice(0, 5).map((f, fi) => (
                          <span
                            key={fi}
                            title={`${f.opp} ${f.score} (${f.date})`}
                            className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold leading-none ${
                              f.result === "W" ? "bg-green-500/80 text-white"
                              : f.result === "D" ? "bg-slate-500/80 text-white"
                              : "bg-red-500/70 text-white"
                            }`}
                          >
                            {f.result}
                          </span>
                        ))
                      : <span className="text-[10px] text-slate-700">—</span>
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live-ställning från dina tips */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <table className="w-full text-sm">
          <tbody>
            {standings.map((st, i) => {
              const t = teamsById[st.teamId];
              const advances = i < 2;
              return (
                <tr key={st.teamId} className={advances ? "text-pitch-200" : "text-slate-400"}>
                  <td className="py-0.5 pr-2 tabular-nums">{i + 1}.</td>
                  <td className="py-0.5">
                    <TeamLabel team={t} /> {advances && <span className="text-[10px]">▲</span>}
                    {i === 2 && <span className="text-[10px] text-amber-300/70"> (trea)</span>}
                  </td>
                  <td className="py-0.5 text-right tabular-nums text-slate-400">{st.points} p</td>
                  <td className="w-10 py-0.5 text-right tabular-nums text-slate-500">
                    {st.gd > 0 ? "+" : ""}{st.gd}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
