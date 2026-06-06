"use client";

import Link from "next/link";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Row {
  id: string;
  displayName: string;
  submitted: boolean;
  total: number;
  rank: number;
  isMe: boolean;
  breakdown: Record<string, number> | null;
}

const medals = ["🥇", "🥈", "🥉"];

export function Leaderboard() {
  const { data, isLoading } = useSWR<{ rows: Row[] }>("/api/leaderboard", fetcher, {
    refreshInterval: 30000,
  });

  if (isLoading) return <div className="card p-6 text-slate-400">Laddar…</div>;
  const rows = data?.rows ?? [];
  if (!rows.length) return <div className="card p-6 text-slate-400">Inga spelare än.</div>;

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-2 py-3">Spelare</th>
            <th className="hidden px-2 py-3 text-right sm:table-cell">Grupp</th>
            <th className="hidden px-2 py-3 text-right sm:table-cell">Vidare</th>
            <th className="hidden px-2 py-3 text-right sm:table-cell">Slutspel</th>
            <th className="px-4 py-3 text-right">Poäng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = r.breakdown ?? {};
            return (
              <tr
                key={r.id}
                className={`border-t border-white/5 ${r.isMe ? "bg-pitch-500/10" : ""}`}
              >
                <td className="px-4 py-3 font-semibold tabular-nums">
                  {r.rank <= 3 ? medals[r.rank - 1] : r.rank}
                </td>
                <td className="px-2 py-3">
                  <Link href={`/spelare/${r.id}`} className="font-medium hover:underline">
                    {r.displayName}
                  </Link>
                  {r.isMe && <span className="ml-1 text-xs text-pitch-300">(du)</span>}
                  {!r.submitted && <span className="ml-2 chip text-amber-300/80">ej inlämnat</span>}
                </td>
                <td className="hidden px-2 py-3 text-right tabular-nums text-slate-400 sm:table-cell">
                  {b.groupMatches ?? 0}
                </td>
                <td className="hidden px-2 py-3 text-right tabular-nums text-slate-400 sm:table-cell">
                  {b.advancement ?? 0}
                </td>
                <td className="hidden px-2 py-3 text-right tabular-nums text-slate-400 sm:table-cell">
                  {(b.knockout ?? 0) + (b.champion ?? 0)}
                </td>
                <td className="px-4 py-3 text-right text-lg font-extrabold tabular-nums">{r.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
