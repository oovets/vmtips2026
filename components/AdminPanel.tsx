"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminManage } from "./AdminManage";
import { AdminLogs } from "./AdminLogs";
import { AdminGuestbook } from "./AdminGuestbook";

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
  channel: string | null;
}

export interface TipStatus {
  matches: number;
  matchesTotal: number;
  groups: number;
  groupsTotal: number;
  bracket: number;
  bracketTotal: number;
}

interface UserRow {
  id: string;
  displayName: string;
  isAdmin: boolean;
  submitted: boolean;
  score: number | null;
  tips: TipStatus;
}

interface LeagueRow {
  id: string;
  name: string;
  joinCode: string;
  users: UserRow[];
}

type Tab = "matches" | "manage" | "logs" | "guestbook";

interface TeamLite {
  id: string;
  name: string;
  flag: string;
}

export function AdminPanel({
  matches,
  leagues,
  teams,
  topScorer,
}: {
  matches: MatchRow[];
  leagues: LeagueRow[];
  teams: TeamLite[];
  topScorer: { player: string; teamId: string };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("matches");
  const [rows, setRows] = useState(matches);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [scorerPlayer, setScorerPlayer] = useState(topScorer.player);
  const [scorerTeamId, setScorerTeamId] = useState(topScorer.teamId);

  async function saveTopScorer() {
    const ok = await call("/api/admin/top-scorer", {
      player: scorerPlayer.trim() || null,
      teamId: scorerTeamId || null,
    });
    if (ok) setMsg(scorerPlayer.trim() ? "✅ Skyttekung-facit sparat och poäng omräknade." : "✅ Skyttekung-facit rensat.");
  }

  function update(n: number, patch: Partial<MatchRow>) {
    setRows((prev) => prev.map((r) => (r.matchNumber === n ? { ...r, ...patch } : r)));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
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
      else
        setMsg(
          `✅ Klart. ${data.matchesUpdated != null ? `${data.matchesUpdated} matcher, ` : ""}${
            data.detailsUpdated != null ? `${data.detailsUpdated} matchdetaljer, ` : ""
          }${data.playersScored ?? 0} spelare omräknade.`
        );
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

  async function saveChannel(r: MatchRow) {
    const ok = await call("/api/admin/channel", {
      matchNumber: r.matchNumber,
      channel: r.channel ?? "",
    });
    if (ok) setMsg("✅ Kanal sparad.");
  }

  const filtered = rows.filter((r) => {
    const label = `${r.home?.label ?? r.homeSlot} ${r.away?.label ?? r.awaySlot} ${r.stage}`.toLowerCase();
    return label.includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Verktygsfält */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        {/* Flikar */}
        <div className="flex rounded-xl bg-night-950/60 p-1 gap-1">
          <button
            onClick={() => setTab("matches")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === "matches" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            Matcher
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === "manage" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            Ligor &amp; Spelare
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === "logs" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            Loggar
          </button>
          <button
            onClick={() => setTab("guestbook")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === "guestbook" ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            Klotterplank
          </button>
        </div>

        {tab === "matches" && (
          <>
            <button onClick={() => call("/api/admin/sync")} disabled={busy} className="btn-primary btn-sm">
              Synka resultat
            </button>
            <button onClick={() => call("/api/admin/sync-details")} disabled={busy} className="btn-ghost btn-sm">
              Synka matchdetaljer
            </button>
            <button onClick={() => call("/api/admin/seed-form")} disabled={busy} className="btn-ghost btn-sm">
              Ladda lagform
            </button>
            <button onClick={() => call("/api/admin/sync-form")} disabled={busy} className="btn-ghost btn-sm">
              Synka lagform (API)
            </button>
            <button onClick={() => call("/api/admin/recompute")} disabled={busy} className="btn-ghost btn-sm">
              Räkna om poäng
            </button>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input ml-auto w-44"
              placeholder="Filtrera matcher…"
            />
          </>
        )}

        <button onClick={logout} className="btn-ghost btn-sm ml-auto border-0">
          Logga ut admin
        </button>
      </div>

      {msg && tab === "matches" && (
        <p className="rounded-lg bg-white/5 px-4 py-2 text-sm">{msg}</p>
      )}

      {/* VM:s skyttekung — facit (frivilligt tips) */}
      {tab === "matches" && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold">⚽ VM:s skyttekung — facit</h3>
            <span className="text-[11px] text-slate-500">Spara namnet så får spelare med rätt tips bonuspoäng</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={scorerPlayer}
              onChange={(e) => setScorerPlayer(e.target.value)}
              placeholder="Skyttekungens namn"
              className="input min-w-0 flex-1"
              maxLength={80}
            />
            <select
              value={scorerTeamId}
              onChange={(e) => setScorerTeamId(e.target.value)}
              className="input sm:w-52"
            >
              <option value="">Lag (valfritt)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
              ))}
            </select>
            <button onClick={saveTopScorer} disabled={busy} className="btn-primary btn-sm shrink-0">
              Spara facit
            </button>
          </div>
        </div>
      )}

      {/* Matcher-fliken */}
      {tab === "matches" && (
        <div className="card divide-y divide-white/5">
          <datalist id="admin-channels">
            <option value="SVT" />
            <option value="TV4" />
            <option value="Viaplay" />
          </datalist>
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
                  onChange={(e) =>
                    update(r.matchNumber, {
                      homeScore: e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                />
                <span>–</span>
                <input
                  className="score-input h-8 w-10"
                  inputMode="numeric"
                  value={r.awayScore ?? ""}
                  onChange={(e) =>
                    update(r.matchNumber, {
                      awayScore: e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                />
                <span className="flex-1">{r.away?.label ?? r.awaySlot}</span>

                {isKo && r.home && r.away && (
                  <select
                    className="input h-8 w-32 py-0 text-xs"
                    value={r.winnerTeamId ?? ""}
                    onChange={(e) =>
                      update(r.matchNumber, { winnerTeamId: e.target.value || null })
                    }
                  >
                    <option value="">Vinnare?</option>
                    <option value={r.home.id}>{r.home.label}</option>
                    <option value={r.away.id}>{r.away.label}</option>
                  </select>
                )}
                {r.status === "FINISHED" && <span className="chip text-pitch-300">klar</span>}
                <input
                  className="input h-8 w-24 py-0 text-xs"
                  placeholder="Kanal"
                  list="admin-channels"
                  value={r.channel ?? ""}
                  onChange={(e) => update(r.matchNumber, { channel: e.target.value })}
                  onBlur={() => saveChannel(r)}
                />
                <button
                  onClick={() => saveResult(r)}
                  disabled={busy}
                  className="btn-ghost btn-sm"
                >
                  Spara
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Hantera-fliken */}
      {tab === "manage" && <AdminManage leagues={leagues} />}

      {/* Loggar-fliken */}
      {tab === "logs" && <AdminLogs />}

      {/* Klotterplank-fliken */}
      {tab === "guestbook" && <AdminGuestbook />}
    </div>
  );
}
