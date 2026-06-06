"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "join" | "create";

export function AuthForms() {
  const [tab, setTab] = useState<Tab>("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const body =
      tab === "create"
        ? {
            leagueName: String(fd.get("leagueName") ?? ""),
            displayName: String(fd.get("displayName") ?? ""),
            pin: String(fd.get("pin") ?? ""),
          }
        : {
            joinCode: String(fd.get("joinCode") ?? "").toUpperCase(),
            displayName: String(fd.get("displayName") ?? ""),
            pin: String(fd.get("pin") ?? ""),
          };
    const url = tab === "create" ? "/api/leagues" : "/api/leagues/join";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Något gick fel");
        return;
      }
      if (tab === "create" && data.joinCode) {
        setCreatedCode(data.joinCode);
        setTimeout(() => {
          router.push("/mitt-lag");
          router.refresh();
        }, 1800);
      } else {
        router.push("/mitt-lag");
        router.refresh();
      }
    } catch {
      setError("Nätverksfel");
    } finally {
      setLoading(false);
    }
  }

  if (createdCode) {
    return (
      <div className="card animate-fade-in p-6 text-center">
        <h2 className="text-lg font-bold">Ligan är skapad! 🎉</h2>
        <p className="mt-2 text-sm text-slate-300">Dela den här koden med kompisarna:</p>
        <div className="my-4 select-all rounded-xl border border-pitch-500/40 bg-pitch-500/10 py-4 text-3xl font-extrabold tracking-[0.3em] text-pitch-100">
          {createdCode}
        </div>
        <p className="text-xs text-slate-400">Tar dig till ditt lag…</p>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in p-6">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-night-950/60 p-1">
        <button
          onClick={() => setTab("create")}
          className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "create" ? "bg-pitch-500 text-white" : "text-slate-300"}`}
        >
          Skapa liga
        </button>
        <button
          onClick={() => setTab("join")}
          className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "join" ? "bg-pitch-500 text-white" : "text-slate-300"}`}
        >
          Gå med
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === "create" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Liganamn</span>
            <input name="leagueName" className="input" placeholder="t.ex. Kontoret VM 2026" required minLength={2} />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Liga-kod</span>
            <input name="joinCode" className="input uppercase tracking-widest" placeholder="ABC123" required />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Ditt namn</span>
          <input name="displayName" className="input" placeholder="Stefan" required minLength={2} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">PIN (4 siffror)</span>
          <input
            name="pin"
            className="input tracking-[0.5em]"
            placeholder="••••"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            Används för att logga in igen senare. Inget lösenord behövs.
          </span>
        </label>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "…" : tab === "create" ? "Skapa liga & börja tippa" : "Gå med i ligan"}
        </button>
      </form>
    </div>
  );
}
