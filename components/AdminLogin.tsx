"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fel admin-PIN");
        return;
      }
      window.location.reload();
    } catch {
      setError("Nätverksfel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <p className="text-sm text-slate-400">Logga in med admin-PIN — ingen liga behövs.</p>
      </div>
      <form onSubmit={submit} className="card space-y-3 p-6">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Admin-PIN</span>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="input tracking-widest"
            placeholder="••••"
            autoFocus
            required
          />
        </label>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={loading || !pin} className="btn-primary w-full">
          {loading ? "…" : "Logga in som admin"}
        </button>
      </form>
    </div>
  );
}
