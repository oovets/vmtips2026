"use client";

import { useEffect, useState } from "react";

// "Sedan du var här": jämför ditt nuvarande läge med förra besöket (sparat i
// localStorage) och visar vad som hänt — nya resultat, placeringsändring och
// poängskillnad. Bygger enbart på riktig data; visar inget vid första besöket.
interface Snapshot {
  ts: number;
  rank: number | null;
  points: number;
}

interface Summary {
  newResults: number;
  rankDelta: number | null; // positivt = klättrat
  pointsDelta: number;
}

const KEY = "dash:lastVisit";

export function SinceLastVisit({
  rank,
  points,
  resultTimes,
}: {
  rank: number | null;
  points: number;
  resultTimes: string[]; // ISO-tider då matcher avgjorts/uppdaterats
}) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const prev = JSON.parse(raw) as Snapshot;
        const newResults = resultTimes.filter((t) => new Date(t).getTime() > prev.ts).length;
        const rankDelta = prev.rank != null && rank != null ? prev.rank - rank : null;
        const pointsDelta = points - prev.points;
        if (newResults > 0 || (rankDelta !== null && rankDelta !== 0) || pointsDelta !== 0) {
          setSummary({ newResults, rankDelta, pointsDelta });
        }
      }
    } catch {
      // localStorage kan vara blockerat — då hoppar vi tyst över sammanfattningen.
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({ ts: now, rank, points } satisfies Snapshot));
    } catch {
      // ignorera
    }
    // resultTimes serialiseras till en stabil sträng som dep nedan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank, points, resultTimes.join(",")]);

  if (!summary) return null;

  const parts: { text: string; tone: "neutral" | "up" | "down" }[] = [];
  if (summary.newResults > 0) {
    parts.push({
      text: `${summary.newResults} ${summary.newResults === 1 ? "nytt resultat" : "nya resultat"}`,
      tone: "neutral",
    });
  }
  if (summary.rankDelta !== null && summary.rankDelta !== 0) {
    const up = summary.rankDelta > 0;
    const n = Math.abs(summary.rankDelta);
    parts.push({
      text: `${up ? "Klättrat" : "Tappat"} ${n} ${n === 1 ? "placering" : "placeringar"}`,
      tone: up ? "up" : "down",
    });
  }
  if (summary.pointsDelta !== 0) {
    const up = summary.pointsDelta > 0;
    parts.push({
      text: `${up ? "+" : ""}${summary.pointsDelta} poäng`,
      tone: up ? "up" : "down",
    });
  }

  return (
    <div className="card animate-fade-in flex flex-wrap items-center gap-x-4 gap-y-1 border-flag-500/30 bg-flag-500/[0.06] px-4 py-2.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-flag-300">Sedan du var här</span>
      {parts.map((p, i) => (
        <span
          key={i}
          className={`tabular-nums ${
            p.tone === "up" ? "text-green-300" : p.tone === "down" ? "text-red-300" : "text-slate-200"
          }`}
        >
          {p.tone === "up" ? "↑ " : p.tone === "down" ? "↓ " : ""}
          {p.text}
        </span>
      ))}
    </div>
  );
}
