"use client";

import { useState } from "react";
import Link from "next/link";
import type { TipStatus } from "./AdminPanel";

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

interface Props {
  leagues: LeagueRow[];
}

type EditingUser = { id: string; field: "name" | "pin"; value: string };

export function AdminManage({ leagues: initial }: Props) {
  const [leagues, setLeagues] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null); // stores id of item being acted on
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "league" | "user"; id: string; label: string } | null>(null);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function api(method: string, url: string, body?: object) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  function tipsComplete(tips: TipStatus) {
    return (
      tips.matches >= tips.matchesTotal &&
      tips.groups >= tips.groupsTotal &&
      tips.bracket >= tips.bracketTotal
    );
  }

  async function submitForUser(leagueId: string, user: UserRow) {
    setBusy(user.id);
    const { ok, data } = await api("POST", `/api/admin/users/${user.id}/submit`);
    setBusy(null);
    if (ok) {
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === leagueId
            ? { ...l, users: l.users.map((u) => (u.id === user.id ? { ...u, submitted: true } : u)) }
            : l,
        ),
      );
      flash(`${user.displayName} är nu inlämnad.`);
    } else {
      flash(data.error ?? "Kunde inte lämna in åt spelaren.", false);
    }
  }

  async function deleteLeague(id: string) {
    setBusy(id);
    const { ok } = await api("DELETE", `/api/admin/leagues/${id}`);
    setBusy(null);
    if (ok) {
      setLeagues((prev) => prev.filter((l) => l.id !== id));
      flash("Ligan raderades.");
    } else {
      flash("Kunde inte radera ligan.", false);
    }
  }

  async function deleteUser(leagueId: string, userId: string) {
    setBusy(userId);
    const { ok } = await api("DELETE", `/api/admin/users/${userId}`);
    setBusy(null);
    if (ok) {
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === leagueId ? { ...l, users: l.users.filter((u) => u.id !== userId) } : l
        )
      );
      flash("Spelaren raderades.");
    } else {
      flash("Kunde inte radera spelaren.", false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const body =
      editing.field === "pin"
        ? { pin: editing.value }
        : { displayName: editing.value };

    if (editing.field === "pin" && !/^\d{4}$/.test(editing.value)) {
      flash("PIN måste vara exakt 4 siffror.", false);
      return;
    }
    if (editing.field === "name" && editing.value.trim().length < 2) {
      flash("Namn måste vara minst 2 tecken.", false);
      return;
    }

    setBusy(editing.id);
    const { ok, data } = await api("PATCH", `/api/admin/users/${editing.id}`, body);
    setBusy(null);
    if (ok) {
      if (editing.field === "name") {
        setLeagues((prev) =>
          prev.map((l) => ({
            ...l,
            users: l.users.map((u) =>
              u.id === editing.id ? { ...u, displayName: data.displayName } : u
            ),
          }))
        );
      }
      flash(editing.field === "pin" ? "PIN bytt." : "Namn bytt.");
      setEditing(null);
    } else {
      flash(data.error ?? "Misslyckades.", false);
    }
  }

  async function toggleAdmin(leagueId: string, user: UserRow) {
    setBusy(user.id);
    const { ok, data } = await api("PATCH", `/api/admin/users/${user.id}`, { isAdmin: !user.isAdmin });
    setBusy(null);
    if (ok) {
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === leagueId
            ? { ...l, users: l.users.map((u) => (u.id === user.id ? { ...u, isAdmin: data.isAdmin } : u)) }
            : l
        )
      );
      flash(`${user.displayName} är nu ${data.isAdmin ? "admin" : "vanlig spelare"}.`);
    } else {
      flash("Misslyckades.", false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p
          className={`rounded-lg px-4 py-2 text-sm ${
            msg.ok ? "bg-pitch-500/15 text-pitch-100" : "bg-red-500/15 text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      {leagues.length === 0 && (
        <p className="text-sm text-slate-400">Inga ligor skapade ännu.</p>
      )}

      {leagues.map((league) => (
        <div key={league.id} className="card overflow-hidden">
          {/* Liga-header */}
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-pitch-500/10 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{league.name}</p>
              <p className="text-xs text-slate-400">
                Kod:{" "}
                <span className="font-mono font-bold tracking-widest text-flag-500">
                  {league.joinCode}
                </span>{" "}
                · {league.users.length} spelare
              </p>
            </div>
            <button
              onClick={() =>
                setConfirmDelete({ type: "league", id: league.id, label: league.name })
              }
              disabled={busy === league.id}
              className="btn-ghost btn-sm border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              Radera liga
            </button>
          </div>

          {/* Spelare */}
          {league.users.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Inga spelare i ligan.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {league.users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    {editing?.id === user.id && editing.field === "name" ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="input h-8 py-0 text-sm w-36"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                        <button onClick={saveEdit} disabled={!!busy} className="btn-primary btn-sm">
                          Spara
                        </button>
                        <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{user.displayName}</span>
                          {user.isAdmin && (
                            <span className="chip text-[10px] py-0 px-1.5">admin</span>
                          )}
                          {user.score !== null && (
                            <span className="text-xs text-slate-400">{user.score}p</span>
                          )}
                        </div>
                        <TipStatusRow submitted={user.submitted} tips={user.tips} />
                      </div>
                    )}
                  </div>

                  {!(editing?.id === user.id) && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {/* Full insyn i spelarens tips */}
                      <Link href={`/spelare/${user.id}`} className="btn-ghost btn-sm">
                        Visa tips
                      </Link>

                      {!user.submitted && tipsComplete(user.tips) && (
                        <button
                          onClick={() => submitForUser(league.id, user)}
                          disabled={busy === user.id}
                          className="btn-primary btn-sm"
                        >
                          Lämna in åt spelare
                        </button>
                      )}

                      {/* Byt namn */}
                      <button
                        onClick={() => setEditing({ id: user.id, field: "name", value: user.displayName })}
                        className="btn-ghost btn-sm"
                      >
                        Byt namn
                      </button>

                      {/* Byt PIN */}
                      {editing?.id === user.id && editing.field === "pin" ? null : (
                        <button
                          onClick={() => setEditing({ id: user.id, field: "pin", value: "" })}
                          className="btn-ghost btn-sm"
                        >
                          Byt PIN
                        </button>
                      )}

                      {/* Toggle admin */}
                      <button
                        onClick={() => toggleAdmin(league.id, user)}
                        disabled={busy === user.id}
                        className="btn-ghost btn-sm"
                      >
                        {user.isAdmin ? "Ta bort admin" : "Gör admin"}
                      </button>

                      {/* Radera */}
                      <button
                        onClick={() =>
                          setConfirmDelete({ type: "user", id: user.id, label: user.displayName })
                        }
                        disabled={busy === user.id}
                        className="btn-ghost btn-sm border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        Radera
                      </button>
                    </div>
                  )}

                  {/* PIN-inmatning (inline under raden) */}
                  {editing?.id === user.id && editing.field === "pin" && (
                    <div className="w-full flex items-center gap-2 mt-1 pl-0">
                      <input
                        className="input h-8 py-0 text-sm w-28 tracking-widest"
                        inputMode="numeric"
                        maxLength={4}
                        pattern="\d{4}"
                        placeholder="Ny PIN"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button onClick={saveEdit} disabled={!!busy} className="btn-primary btn-sm">
                        Spara
                      </button>
                      <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Bekräftelsedialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card max-w-sm w-full mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {confirmDelete.type === "league" ? "Radera liga?" : "Radera spelare?"}
            </h2>
            <p className="text-sm text-slate-300">
              {confirmDelete.type === "league" ? (
                <>
                  Ligan <strong>{confirmDelete.label}</strong> och alla dess spelare, tips och
                  poäng raderas permanent.
                </>
              ) : (
                <>
                  Spelaren <strong>{confirmDelete.label}</strong> och alla deras tips raderas
                  permanent.
                </>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirmDelete.type === "league") {
                    deleteLeague(confirmDelete.id);
                  } else {
                    const league = leagues.find((l) =>
                      l.users.some((u) => u.id === confirmDelete.id)
                    );
                    if (league) deleteUser(league.id, confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="btn flex-1 bg-red-600 text-white hover:bg-red-700"
              >
                Ja, radera
              </button>
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost flex-1">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Kompakt status över hur komplett en spelares tips är — ger admin överblick
// över pågående (ej inlämnade) lag utan att behöva öppna varje spelare.
function TipStatusRow({ submitted, tips }: { submitted: boolean; tips: TipStatus }) {
  const complete =
    tips.matches >= tips.matchesTotal &&
    tips.groups >= tips.groupsTotal &&
    tips.bracket >= tips.bracketTotal;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${
          submitted
            ? "bg-green-500/15 text-green-300"
            : "bg-amber-500/15 text-amber-300"
        }`}
      >
        {submitted ? "Inlämnat" : "Pågående"}
      </span>
      {!submitted && complete && (
        <span className="rounded bg-pitch-500/15 px-1.5 py-0.5 font-semibold text-pitch-200">Klart att lämna in</span>
      )}
      <StatusPart label="Matcher" value={tips.matches} total={tips.matchesTotal} />
      <StatusPart label="Grupper" value={tips.groups} total={tips.groupsTotal} />
      <StatusPart label="Slutspel" value={tips.bracket} total={tips.bracketTotal} />
    </div>
  );
}

function StatusPart({ label, value, total }: { label: string; value: number; total: number }) {
  const done = value >= total;
  return (
    <span className={`tabular-nums ${done ? "text-slate-400" : "text-slate-500"}`}>
      {label} <span className={done ? "text-green-300" : "text-slate-300"}>{value}/{total}</span>
    </span>
  );
}
