"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "login" | "join" | "create";

interface Choice { userId: string; leagueName: string; displayName: string; }

export function AuthForms({ defaultTab = "login", prefillCode = "" }: { defaultTab?: Tab; prefillCode?: string }) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [pendingPin, setPendingPin] = useState("");
  const router = useRouter();

  function switchTab(t: Tab) { setTab(t); setError(null); setChoices(null); }

  async function pickLeague(userId: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "", pin: pendingPin, userId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Fel"); return; }
    // Inloggning via liga-väljaren → dashboard.
    window.location.href = "/dashboard";
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setChoices(null);
    const fd = new FormData(e.currentTarget);

    let url: string;
    let body: object;

    if (tab === "login") {
      const pin = String(fd.get("pin") ?? "");
      setPendingPin(pin);
      url = "/api/auth/login";
      body = { displayName: String(fd.get("displayName") ?? ""), pin };
    } else if (tab === "join") {
      url = "/api/leagues/join";
      body = {
        joinCode: String(fd.get("joinCode") ?? "").toUpperCase(),
        displayName: String(fd.get("displayName") ?? ""),
        pin: String(fd.get("pin") ?? ""),
      };
    } else {
      url = "/api/leagues";
      body = {
        leagueName: String(fd.get("leagueName") ?? ""),
        displayName: String(fd.get("displayName") ?? ""),
        pin: String(fd.get("pin") ?? ""),
        tippingMode: String(fd.get("tippingMode") ?? "EXACT"),
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Något gick fel"); return; }

      if (data.choices) {
        setChoices(data.choices);
        return;
      }
      if (tab === "create" && data.joinCode) {
        setJoinCode(data.joinCode);
        setTimeout(() => { window.location.href = "/mitt-lag"; }, 2500);
      } else if (tab === "login") {
        // Vanlig inloggning → dashboard/översikt.
        window.location.href = "/dashboard";
      } else {
        // Registrering (gå med i liga) → direkt till tipset.
        window.location.href = "/mitt-lag";
      }
    } catch {
      setError("Nätverksfel");
    } finally {
      setLoading(false);
    }
  }

  if (joinCode) {
    return (
      <div className="card animate-fade-in p-6 text-center space-y-3">
        <h2 className="text-lg font-bold">Ligan är skapad!</h2>
        <p className="text-sm text-slate-300">Dela den här koden med dina spelare:</p>
        <div className="my-2 select-all rounded-xl border border-flag-500/40 bg-flag-500/10 py-4 text-3xl font-extrabold tracking-[0.3em] text-flag-500">
          {joinCode}
        </div>
        <p className="text-xs text-slate-400">Koden finns också under Inställningar.</p>
      </div>
    );
  }

  if (choices) {
    return (
      <div className="card animate-fade-in p-6 space-y-4" id="auth">
        <div>
          <h2 className="text-base font-bold">Välj liga</h2>
          <p className="text-xs text-slate-400">Du finns i flera ligor. Vilken vill du logga in i?</p>
        </div>
        <div className="space-y-2">
          {choices.map((c) => (
            <button
              key={c.userId}
              onClick={() => pickLeague(c.userId)}
              disabled={loading}
              className="btn-ghost btn-sm w-full justify-start text-left"
            >
              <span className="font-semibold">{c.leagueName}</span>
              <span className="ml-auto text-slate-400 text-xs">{c.displayName}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setChoices(null)} className="text-xs text-slate-500 hover:text-slate-300">
          Tillbaka
        </button>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in p-6" id="auth">
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-night-950/60 p-1">
        {(["login", "join", "create"] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`rounded-lg py-2 text-sm font-semibold transition ${tab === t ? "bg-pitch-500 text-white" : "text-slate-300 hover:text-white"}`}
          >
            {t === "login" ? "Logga in" : t === "join" ? "Gå med" : "Skapa liga"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === "login" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Ditt namn</span>
              <input name="displayName" className="input" placeholder="Stefan" required minLength={2} autoComplete="username" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">PIN (4 siffror)</span>
              <input name="pin" className="input tracking-[0.5em]" placeholder="••••" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="current-password" />
            </label>
          </>
        )}

        {tab === "join" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Liga-kod</span>
              <input name="joinCode" className="input uppercase tracking-widest" placeholder="ABC123" defaultValue={prefillCode} required autoComplete="off" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Ditt namn</span>
              <input name="displayName" className="input" placeholder="Stefan" required minLength={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">PIN (4 siffror)</span>
              <input name="pin" className="input tracking-[0.5em]" placeholder="••••" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
            </label>
          </>
        )}

        {tab === "create" && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Liganamn</span>
              <input name="leagueName" className="input" placeholder="t.ex. Kontoret VM 2026" required minLength={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Ditt namn</span>
              <input name="displayName" className="input" placeholder="Stefan" required minLength={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">PIN (4 siffror)</span>
              <input name="pin" className="input tracking-[0.5em]" placeholder="••••" inputMode="numeric" pattern="\d{4}" maxLength={4} required />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Tippningsläge</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(["EXACT", "X12"] as const).map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-night-950/50 p-3 has-[:checked]:border-pitch-500/60 has-[:checked]:bg-pitch-500/10">
                    <input type="radio" name="tippingMode" value={m} defaultChecked={m === "EXACT"} className="mt-0.5 accent-pitch-500" />
                    <div>
                      <p className="text-xs font-semibold leading-tight">{m === "EXACT" ? "Exakt resultat" : "1 / X / 2"}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{m === "EXACT" ? "Tippa 3-1 osv. Mer poäng." : "Bara vinnare/oavgjort. Enklare."}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button type="submit" disabled={loading} className="btn-yellow w-full">
          {loading ? "…" : tab === "login" ? "Logga in" : tab === "join" ? "Gå med i ligan" : "Skapa liga"}
        </button>
      </form>
    </div>
  );
}
