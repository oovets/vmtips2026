"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeGroupStandings,
  bestThirds,
  type ResultRef,
  type Standing,
} from "@/lib/standings";
import { resolveR32Participants, buildValidatedTree, completeBracket } from "@/lib/bracket";
import { BRACKET } from "@/lib/bracket-template";
import { BracketBuilder } from "./BracketBuilder";
import { TeamLabel, type TeamLite } from "./TeamPill";

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
  initial: { scores: Record<number, { h: number; a: number }>; koWinners: Record<number, string> };
  locked: boolean;
  submitted: boolean;
}

const LETTERS = "ABCDEFGHIJKL".split("");
type ScoreVal = { h: number | null; a: number | null };

export function TippingForm({ teams, groupMatches, initial, locked, submitted }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"group" | "ko">("group");
  const [scores, setScores] = useState<Record<number, ScoreVal>>(() => {
    const s: Record<number, ScoreVal> = {};
    for (const [n, v] of Object.entries(initial.scores)) s[Number(n)] = { h: v.h, a: v.a };
    return s;
  });
  const [koWinners, setKoWinners] = useState<Record<number, string>>(initial.koWinners);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

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
      const s = scores[m.matchNumber];
      if (s && s.h != null && s.a != null) {
        out.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: s.h, awayScore: s.a });
      }
    }
    return out;
  }, [scores, groupMatches]);

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
        const s = scores[m.matchNumber];
        return s && s.h != null && s.a != null;
      }).length;
    }
    return out;
  }, [groups, scores]);

  const allComplete = groups.every((g) => groupFilled[g.letter] === 6);
  const filledTotal = Object.values(groupFilled).reduce((a, b) => a + b, 0);

  const thirds = useMemo(() => (allComplete ? bestThirds(standingsMap) : []), [allComplete, standingsMap]);
  const r32 = useMemo(
    () => (allComplete ? resolveR32Participants(standingsMap, thirds) : {}),
    [allComplete, standingsMap, thirds],
  );
  const tree = useMemo(() => buildValidatedTree(r32, koWinners), [r32, koWinners]);
  const koPicked = Object.keys(tree.winners).length;

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

  // Fyll tomma gruppmatcher med slumpade resultat (valfri grupp, annars alla)
  function randomizeScores(onlyLetter?: string) {
    setScores((prev) => {
      const next = { ...prev };
      for (const m of groupMatches) {
        if (onlyLetter && m.groupId !== onlyLetter) continue;
        const s = prev[m.matchNumber];
        if (!s || s.h == null || s.a == null) {
          const r = randomScore();
          next[m.matchNumber] = { h: r.h, a: r.a };
        }
      }
      return next;
    });
    setMsg(null);
  }

  // Slumpa vinnare för återstående slutspelsmatcher (cascade upp till final)
  function randomizeBracketRest() {
    setKoWinners((prev) => completeBracket(r32, prev, randomWinner, false) as Record<number, string>);
    setMsg(null);
  }

  async function save(submit: boolean) {
    setSaving(true);
    setMsg(null);
    const matchPreds = Object.entries(scores)
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
        body: JSON.stringify({ submit, matchPreds, groupPreds, bracketPreds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Kunde inte spara");
      } else {
        setMsg(submit ? "🎉 Inlämnat! Lycka till!" : "💾 Sparat som utkast.");
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
          <p className="text-lg">🔒 Tipsen är låsta — turneringen har börjat.</p>
          <p className="mt-2 text-sm text-slate-400">
            Följ din progress på <a className="text-pitch-400 underline" href="/leaderboard">topplistan</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header submitted={submitted} locked={false} />

      {/* Förlopp + spara (sticky under toppbaren) */}
      <div className="card sticky top-[60px] z-20 space-y-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            Gruppmatcher: <strong>{filledTotal}/72</strong>
          </span>
          <span>
            Slutspelsval: <strong>{koPicked}/32</strong>
          </span>
          {!allComplete && (
            <span className="text-xs text-amber-300">Fyll i alla gruppmatcher för slutspelet ⤵</span>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <button onClick={() => save(false)} disabled={saving} className="btn-ghost flex-1 sm:flex-none">
            Spara utkast
          </button>
          <button onClick={() => save(true)} disabled={saving} className="btn-primary flex-1 sm:flex-none">
            Lämna in lag
          </button>
        </div>
        {msg && <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-pitch-200">{msg}</p>}
      </div>

      {/* Flikar */}
      <div className="grid w-full max-w-sm grid-cols-2 gap-1 rounded-xl bg-night-950/60 p-1">
        <button
          onClick={() => setTab("group")}
          className={`rounded-lg py-2 text-sm font-semibold ${tab === "group" ? "bg-pitch-500 text-white" : "text-slate-300"}`}
        >
          Gruppspel
        </button>
        <button
          onClick={() => setTab("ko")}
          className={`rounded-lg py-2 text-sm font-semibold ${tab === "ko" ? "bg-pitch-500 text-white" : "text-slate-300"}`}
        >
          Slutspel
        </button>
      </div>

      {tab === "group" ? (
        <>
          {filledTotal < 72 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2 text-sm text-slate-400">
              <span>Vet du inte / orkar inte? Slumpa de matcher du lämnat tomma.</span>
              <button onClick={() => randomizeScores()} className="btn-ghost shrink-0 py-1.5 text-xs">
                🎲 Slumpa alla tomma
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
                onScore={setScore}
                onRandomize={() => randomizeScores(g.letter)}
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
        <h1 className="text-2xl font-extrabold">Mitt lag</h1>
        <p className="text-sm text-slate-400">Tippa alla matcher och bygg ditt slutspelsträd.</p>
      </div>
      {submitted && !locked && (
        <span className="chip bg-pitch-500/15 text-pitch-200">✓ Inlämnat (kan ändras tills låsning)</span>
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
  onScore,
  onRandomize,
  complete,
}: {
  letter: string;
  matches: GroupMatchLite[];
  teamsById: Record<string, TeamLite>;
  standings: Standing[];
  scores: Record<number, ScoreVal>;
  onScore: (n: number, side: "h" | "a", v: string) => void;
  onRandomize: () => void;
  complete: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Grupp {letter}</h2>
        {complete ? (
          <span className="chip bg-pitch-500/15 text-pitch-200">klar ✓</span>
        ) : (
          <button onClick={onRandomize} className="btn-ghost py-1 text-xs" title="Slumpa tomma matcher i gruppen">
            🎲 Slumpa
          </button>
        )}
      </div>

      <div className="space-y-2">
        {matches.map((m) => {
          const home = teamsById[m.homeTeamId];
          const away = teamsById[m.awayTeamId];
          const s = scores[m.matchNumber] ?? { h: null, a: null };
          return (
            <div
              key={m.matchNumber}
              className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-1.5"
            >
              <div className="min-w-0 text-sm">
                <TeamLabel team={home} align="right" />
              </div>
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
              <div className="min-w-0 text-sm">
                <TeamLabel team={away} align="left" />
              </div>
            </div>
          );
        })}
      </div>

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
                    {st.gd > 0 ? "+" : ""}
                    {st.gd}
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
