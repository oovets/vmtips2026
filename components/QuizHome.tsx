"use client";

import { useState } from "react";
import useSWR from "swr";
import { QuizPlayer } from "./QuizPlayer";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Duel {
  quizId: string;
  otherName: string;
  myScore: number | null;
  otherScore: number | null;
  status: "play" | "waiting" | "done";
  outcome: "win" | "loss" | "tie" | null;
  otherAway: number;
}
interface ListData {
  canPlay: boolean;
  daily: { exists: boolean; played: boolean; dayKey: string };
  duels: Duel[];
  opponents: { id: string; displayName: string }[];
  leaderboard: { id: string; name: string; points: number; games: number; isMe: boolean; flagged: boolean }[];
}

const medals = ["🥇", "🥈", "🥉"];

export function QuizHome() {
  const { data, mutate, isLoading } = useSWR<ListData>("/api/quiz/list", fetcher, {
    refreshInterval: 15000,
  });
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opponentId, setOpponentId] = useState("");

  async function start(url: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Något gick fel");
        return;
      }
      setPlaying(d.quizId);
    } catch {
      setError("Nätverksfel");
    } finally {
      setBusy(false);
    }
  }

  if (playing) {
    return (
      <QuizPlayer
        quizId={playing}
        onDone={() => {
          setPlaying(null);
          mutate();
        }}
      />
    );
  }

  if (isLoading) return <div className="card p-6 text-slate-400">Laddar…</div>;
  if (!data) return <div className="card p-6 text-slate-400">Kunde inte ladda quiz.</div>;

  if (!data.canPlay) {
    return (
      <div className="card p-6 text-center text-slate-300">
        🕒 Kom tillbaka när fler matcher spelats — då genereras frågorna automatiskt.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Dagens quiz */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-bold">Dagens quiz</h2>
          <p className="text-sm text-slate-400">Samma frågor för hela ligan idag — snabbast vinner.</p>
        </div>
        {data.daily.played ? (
          <span className="chip bg-pitch-500/15 text-pitch-200">✓ Spelad idag</span>
        ) : (
          <button onClick={() => start("/api/quiz/daily")} disabled={busy} className="btn-primary">
            Spela dagens
          </button>
        )}
      </div>

      {/* Utmana */}
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-bold">Utmana en kompis</h2>
        {data.opponents.length === 0 ? (
          <p className="text-sm text-slate-400">Inga andra spelare i ligan än.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              className="input w-48"
            >
              <option value="">Välj motståndare…</option>
              {data.opponents.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </select>
            <button
              onClick={() => start("/api/quiz", { opponentId })}
              disabled={busy || !opponentId}
              className="btn-primary"
            >
              ⚔️ Starta duell
            </button>
          </div>
        )}

        {data.duels.length > 0 && (
          <div className="divide-y divide-white/5 border-t border-white/10 pt-2">
            {data.duels.map((d) => (
              <div key={d.quizId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  vs <strong>{d.otherName}</strong>
                  {d.status === "done" && (
                    <span
                      className={`ml-2 ${d.outcome === "win" ? "text-pitch-300" : d.outcome === "loss" ? "text-red-300" : "text-slate-400"}`}
                    >
                      {d.outcome === "win" ? "Vinst" : d.outcome === "loss" ? "Förlust" : "Lika"} · {d.myScore}–{d.otherScore}
                      {d.otherAway > 0 && (
                        <span className="ml-1" title={`${d.otherName} lämnade rutan ${d.otherAway} ggr`}>⚠️</span>
                      )}
                    </span>
                  )}
                  {d.status === "waiting" && <span className="ml-2 text-slate-400">väntar på motståndaren ({d.myScore} p)</span>}
                </span>
                {d.status === "play" ? (
                  <button onClick={() => setPlaying(d.quizId)} className="btn-primary py-1.5 text-xs">
                    Spela
                  </button>
                ) : (
                  <span className="chip">{d.status === "waiting" ? "⏳" : "✓"}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quiz-topplista */}
      <div className="card overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3 font-bold">Quiz-topplista</div>
        {data.leaderboard.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Ingen har spelat än — var först!</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.leaderboard.map((r, i) => (
                <tr key={r.id} className={`border-t border-white/5 ${r.isMe ? "bg-pitch-500/10" : ""}`}>
                  <td className="px-4 py-2.5 font-semibold tabular-nums">{i < 3 ? medals[i] : i + 1}</td>
                  <td className="px-2 py-2.5">
                    {r.name} {r.isMe && <span className="text-xs text-pitch-300">(du)</span>}
                    {r.flagged && <span className="ml-1" title="Har lämnat rutan under en quiz">⚠️</span>}
                    <span className="ml-1 text-xs text-slate-500">· {r.games} spel</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-lg font-extrabold tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
