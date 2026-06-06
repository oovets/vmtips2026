"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MatchRow {
  matchNumber: number;
  stage: string;
  home: { id: string; label: string } | null;
  away: { id: string; label: string } | null;
  homeSlot: string | null;
  awaySlot: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  status: string;
}

export function AdminPanel({ matches }: { matches: MatchRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(matches);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function update(n: number, patch: Partial<MatchRow>) {
    setRows((prev) => prev.map((r) => (r.matchNumber === n ? { ...r, ...patch } : r)));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  async function call(url: string, body?: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) setMsg(`❌ ${data.error ?? "Fel"}`);
      else setMsg(`✅ Klart. ${data.matchesUpdated != null ? `${data.matchesUpdated} matcher, ` : ""}${data.playersScored ?? 0} spelare omräknade.`);
      return res.ok;
    } catch {
      setMsg("❌ Nätverksfel");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(r: MatchRow) {
    if (r.homeScore == null || r.awayScore == null) {
      setMsg("Fyll i båda resultaten först");
      return;
    }
    await call("/api/admin/result", {
      matchNumber: r.matchNumber,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      winnerTeamId: r.winnerTeamId,
      status: "FINISHED",
    });
  }

  const filtered = rows.filter((r) => {
    const label = `${r.home?.label ?? r.homeSlot} ${r.away?.label ?? r.awaySlot} ${r.stage}`.toLowerCase();
    return label.includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <button onClick={() => call("/api/admin/sync")} disabled={busy} className="btn-primary">
          🔄 Synka från API
        </button>
        <button onClick={() => call("/api/admin/recompute")} disabled={busy} className="btn-ghost">
          🧮 Räkna om poäng
        </button>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input ml-auto w-44"
          placeholder="Filtrera matcher…"
        />
        <button onClick={logout} className="btn-ghost text-xs">
          Logga ut admin
        </button>
      </div>
      {msg && <p className="rounded-lg bg-white/5 px-4 py-2 text-sm">{msg}</p>}

      <div className="card divide-y divide-white/5">
        {filtered.map((r) => {
          const isKo = r.stage !== "GROUP";
          return (
            <div key={r.matchNumber} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="w-8 text-xs text-slate-500">#{r.matchNumber}</span>
              <span className="w-16 shrink-0 text-xs text-slate-500">{r.stage}</span>
              <span className="flex-1 text-right">{r.home?.label ?? r.homeSlot}</span>
              <input
                className="score-input h-8 w-10"
                inputMode="numeric"
                value={r.homeScore ?? ""}
                onChange={(e) => update(r.matchNumber, { homeScore: e.target.value === "" ? null : parseInt(e.target.value) })}
              />
              <span>–</span>
              <input
                className="score-input h-8 w-10"
                inputMode="numeric"
                value={r.awayScore ?? ""}
                onChange={(e) => update(r.matchNumber, { awayScore: e.target.value === "" ? null : parseInt(e.target.value) })}
              />
              <span className="flex-1">{r.away?.label ?? r.awaySlot}</span>

              {isKo && r.home && r.away && (
                <select
                  className="input h-8 w-32 py-0 text-xs"
                  value={r.winnerTeamId ?? ""}
                  onChange={(e) => update(r.matchNumber, { winnerTeamId: e.target.value || null })}
                >
                  <option value="">Vinnare?</option>
                  <option value={r.home.id}>{r.home.label}</option>
                  <option value={r.away.id}>{r.away.label}</option>
                </select>
              )}
              {r.status === "FINISHED" && <span className="chip text-pitch-300">✓</span>}
              <button onClick={() => saveResult(r)} disabled={busy} className="btn-ghost h-8 py-0 text-xs">
                Spara
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
