"use client";

import { useEffect, useState } from "react";

interface GuestbookAdminEntry {
  id: string;
  name: string;
  userName: string | null;
  message: string;
  createdAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

export function AdminGuestbook() {
  const [entries, setEntries] = useState<GuestbookAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/guestbook", { signal });
      const data = (await res.json().catch(() => null)) as { entries?: GuestbookAdminEntry[]; error?: string } | null;
      if (!res.ok) {
        setMsg({ text: data?.error ?? "Kunde inte hämta klotterplanket.", ok: false });
        return;
      }
      setEntries(data?.entries ?? []);
    } catch {
      if (!signal?.aborted) setMsg({ text: "Kunde inte hämta klotterplanket.", ok: false });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  async function deleteEntry(entry: GuestbookAdminEntry) {
    const ok = window.confirm(`Radera inlägget från ${entry.name}?`);
    if (!ok) return;

    setBusy(entry.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/guestbook/${entry.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ text: data?.error ?? "Kunde inte radera inlägget.", ok: false });
        return;
      }
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      setMsg({ text: "Inlägget raderades.", ok: true });
    } catch {
      setMsg({ text: "Nätverksfel vid radering.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-pitch-500/15 text-pitch-100" : "bg-red-500/15 text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold">Klotterplank</h3>
            <p className="text-xs text-slate-500">{entries.length} senaste inlägg</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="btn-ghost btn-sm">
            Uppdatera
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Laddar inlägg…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">Inga inlägg på klotterplanket än.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-200">{entry.name}</span>
                    {entry.userName && entry.userName !== entry.name && (
                      <span className="text-[11px] text-slate-500">konto: {entry.userName}</span>
                    )}
                    <span className="text-[11px] text-slate-500">{formatTime(entry.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-slate-300">{entry.message}</p>
                </div>
                <button
                  onClick={() => void deleteEntry(entry)}
                  disabled={busy === entry.id}
                  className="btn-ghost btn-sm shrink-0 border-red-500/30 text-red-300 hover:bg-red-500/10"
                >
                  {busy === entry.id ? "Raderar…" : "Radera"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
