"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  user: {
    id: string;
    displayName: string;
    leagueName: string;
    joinCode: string;
    tippingMode: "EXACT" | "X12";
  };
}

export function Settings({ user }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.displayName);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function saveField(body: object) {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMsg({ text: "Sparat.", ok: true });
      router.refresh();
    } else {
      setMsg({ text: data.error ?? "Misslyckades.", ok: false });
    }
  }

  function copyJoinCode() {
    const url = `${window.location.origin}/join/${user.joinCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Liga-info */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Din liga</h2>
        <div>
          <p className="text-xs text-slate-500 mb-1">Liganamn</p>
          <p className="font-semibold">{user.leagueName}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Tippningsläge</p>
          <p className="font-semibold">{user.tippingMode === "EXACT" ? "Exakt resultat" : "1 / X / 2"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Liga-kod</p>
          <div className="flex items-center gap-3">
            <span className="select-all font-mono text-2xl font-extrabold tracking-[0.2em] text-flag-500">
              {user.joinCode}
            </span>
            <button onClick={copyJoinCode} className="btn-ghost py-1.5 text-xs">
              {copied ? "Kopierad!" : "Kopiera inbjudningslänk"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Dela länken så kan vänner gå med direkt.
          </p>
        </div>
      </div>

      {/* Byt namn */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Byt namn</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={24}
            placeholder="Ditt namn"
          />
          <button
            onClick={() => saveField({ displayName: name.trim() })}
            disabled={saving || name.trim() === user.displayName || name.trim().length < 2}
            className="btn-primary px-4"
          >
            Spara
          </button>
        </div>
      </div>

      {/* Byt PIN */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Byt PIN</h2>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Ny PIN (4 siffror)</span>
          <input
            className="input tracking-[0.5em] w-36"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Bekräfta PIN</span>
          <input
            className="input tracking-[0.5em] w-36"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="••••"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
          />
        </label>
        {pin && confirmPin && pin !== confirmPin && (
          <p className="text-xs text-red-400">PIN-kодerna matchar inte.</p>
        )}
        <button
          onClick={() => { saveField({ pin }); setPin(""); setConfirmPin(""); }}
          disabled={saving || !/^\d{4}$/.test(pin) || pin !== confirmPin}
          className="btn-primary"
        >
          Byt PIN
        </button>
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-pitch-500/15 text-pitch-100" : "bg-red-500/15 text-red-300"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
