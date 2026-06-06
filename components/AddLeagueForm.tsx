"use client";

import { useState } from "react";

type Mode = "join" | "create";

export function AddLeagueForm({ currentName }: { currentName: string }) {
  const [mode, setMode] = useState<Mode>("join");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ leagueName: string; joinCode?: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const body = mode === "join"
      ? { action: "join", joinCode: String(fd.get("joinCode") ?? "").toUpperCase(), displayName: String(fd.get("displayName") ?? ""), pin: String(fd.get("pin") ?? "") }
      : { action: "create", leagueName: String(fd.get("leagueName") ?? ""), displayName: String(fd.get("displayName") ?? ""), pin: String(fd.get("pin") ?? ""), tippingMode: String(fd.get("tippingMode") ?? "EXACT") };

    const res = await fetch("/api/leagues/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Fel"); return; }
    setDone({ leagueName: data.leagueName, joinCode: data.joinCode });
  }

  if (done) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="font-bold">{done.leagueName} tillagd!</p>
        {done.joinCode && (
          <div className="select-all rounded-xl border border-flag-500/40 bg-flag-500/10 py-3 text-2xl font-extrabold tracking-[0.3em] text-flag-500">
            {done.joinCode}
          </div>
        )}
        <a href="/mitt-lag" className="btn-primary btn-sm inline-block">Byt till ligan</a>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-night-950/60 p-1">
        {(["join", "create"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-lg py-2 text-sm font-semibold transition ${mode === m ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"}`}>
            {m === "join" ? "Gå med i liga" : "Skapa ny liga"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "join" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Liga-kod</span>
            <input name="joinCode" className="input uppercase tracking-widest" placeholder="ABC123" required />
          </label>
        )}
        {mode === "create" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Liganamn</span>
            <input name="leagueName" className="input" placeholder="Familjeligan" required minLength={2} />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Ditt namn i ligan</span>
          <input name="displayName" className="input" defaultValue={currentName} required minLength={2} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">PIN (4 siffror)</span>
          <input name="pin" className="input tracking-[0.5em]" placeholder="••••" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
        </label>
        {mode === "create" && (
          <div className="grid grid-cols-2 gap-1.5">
            {(["EXACT", "X12"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-night-950/50 p-3 has-[:checked]:border-pitch-500/60 has-[:checked]:bg-pitch-500/10">
                <input type="radio" name="tippingMode" value={m} defaultChecked={m === "EXACT"} className="mt-0.5 accent-pitch-500" />
                <div>
                  <p className="text-xs font-semibold leading-tight">{m === "EXACT" ? "Exakt resultat" : "1 / X / 2"}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={loading} className="btn-yellow w-full">
          {loading ? "…" : mode === "join" ? "Gå med" : "Skapa liga"}
        </button>
      </form>
    </div>
  );
}
