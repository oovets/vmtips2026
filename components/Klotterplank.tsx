"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEscapeToClose } from "@/hooks/useEscapeToClose";

export interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  createdAt: string;
}

const MAX_MESSAGE = 280;
// När färre tecken än så återstår visas en liten räknare.
const COUNTER_THRESHOLD = 40;
// Hur många av de senaste meddelandena som roterar i tickern / visas i poppet.
const RECENT_COUNT = 5;
// Hur ofta den roterande raden växlar meddelande (ms).
const ROTATE_MS = 4500;

// Relativ tidsangivelse på svenska, t.ex. "nyss", "3 min sedan", "2 dagar sedan".
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "nyss";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min sedan`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} tim sedan`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days} ${days === 1 ? "dag" : "dagar"} sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" });
}

// Klotterplank: en slimmad rad överst på översikten. Till vänster roterar de
// senaste meddelandena ("ticker") med en liten räknare som vid tryck fäller ut
// de senaste i ett kompakt popover. Inloggade får en chatruta där man skriver
// direkt och skickar med Enter eller pilknappen. Utloggade kan läsa men inte
// skriva — de ser i stället en liten "Logga in för att skriva"-uppmaning.
// `initialEntries` ger en första målning utan flimmer innan klienten hämtar
// hela listan via GET.
export function Klotterplank({
  initialEntries = [],
  loggedIn,
}: {
  initialEntries?: GuestbookEntry[];
  loggedIn: boolean;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>(initialEntries);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [rotateIdx, setRotateIdx] = useState(0);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/guestbook", { signal });
      if (res.ok) {
        const data = (await res.json()) as { entries?: GuestbookEntry[] };
        setEntries(data.entries ?? []);
      }
    } catch {
      // avbruten/nätverksfel — behåll tidigare lista tyst
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const recent = entries.slice(0, RECENT_COUNT);

  // Rotera den synliga raden genom de senaste meddelandena. Pausas när popovern
  // är öppen så att man hinner läsa, och respekterar reducerad rörelse.
  useEffect(() => {
    if (open || recent.length <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setRotateIdx((i) => (i + 1) % recent.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [open, recent.length]);

  // Håll index inom gränsen när listan ändras (t.ex. efter ett nytt inlägg).
  useEffect(() => {
    setRotateIdx((i) => (recent.length ? i % recent.length : 0));
  }, [recent.length]);

  // Stäng popovern vid klick utanför.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEscapeToClose(open, () => setOpen(false));

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Skriv något först");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { entry?: GuestbookEntry; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Något gick fel");
        return;
      }
      setMessage("");
      if (data?.entry) {
        setEntries((prev) => [data.entry as GuestbookEntry, ...prev]);
      } else {
        await load();
      }
      setRotateIdx(0);
      setJustSent(true);
      window.setTimeout(() => setJustSent(false), 1800);
    } catch {
      setError("Kunde inte skicka — försök igen");
    } finally {
      setPosting(false);
    }
  };

  // Samma inloggningsflöde som i Nav: scrolla till auth-sektionen på startsidan.
  const goToLogin = () => {
    if (window.location.pathname !== "/") {
      window.location.href = "/#auth";
    } else {
      document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!posting) void submit();
    }
  };

  const remaining = MAX_MESSAGE - message.length;
  const current = recent[rotateIdx];

  return (
    <div className={`relative animate-fade-in [animation-fill-mode:both] ${open ? "z-50" : ""}`}>
      <div className="card flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
        {/* Senaste meddelandet, roterande — fungerar som knapp till popovern */}
        <button
          type="button"
          onClick={() => recent.length > 0 && setOpen((v) => !v)}
          aria-label={recent.length > 0 ? "Visa senaste meddelandena" : undefined}
          aria-expanded={open}
          disabled={recent.length === 0}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left transition disabled:cursor-default sm:max-w-[50%]"
        >
          {current ? (
            <span key={current.id} className="min-w-0 flex-1 animate-fade-in truncate text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{current.name}:</span>{" "}
              {current.message}
              <span className="text-slate-600"> · {relativeTime(current.createdAt)}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
              {loaded ? "Klotterplanket är tomt – skriv något!" : "Laddar klotterplanket…"}
            </span>
          )}
          {entries.length > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
              {entries.length}
              <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" aria-hidden>
                <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </button>

        {/* Inloggad: chatruta med meddelande + skicka. Utloggad: uppmaning att logga in. */}
        {loggedIn ? (
          <div className="flex shrink-0 items-center gap-2 sm:w-auto">
            <div className="relative flex flex-1 items-center sm:w-56">
              <input
                type="text"
                value={message}
                onChange={(ev) => {
                  setMessage(ev.target.value.slice(0, MAX_MESSAGE));
                  if (error) setError(null);
                }}
                onKeyDown={onKeyDown}
                placeholder={justSent ? "Skickat! Skriv igen…" : "Skriv på klotterplanket…"}
                maxLength={MAX_MESSAGE}
                aria-label="Skriv på klotterplanket"
                className="w-full rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-3 pr-9 text-xs text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-pitch-500/50 focus:bg-white/[0.06]"
              />
              <button
                type="button"
                onClick={() => !posting && void submit()}
                disabled={posting || !message.trim()}
                aria-label="Skicka"
                className="absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-flag-500 text-night-950 transition hover:bg-flag-600 disabled:opacity-40"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                  <path d="M2 8h9M7 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={goToLogin}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-flag-500/50 hover:text-flag-500"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="M7 2h5a1 1 0 011 1v10a1 1 0 01-1 1H7M9 8H2m0 0l2.5-2.5M2 8l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Logga in för att skriva
          </button>
        )}
      </div>

      {/* Liten teckenräknare endast nära gränsen / felmeddelande */}
      {loggedIn && (error || remaining <= COUNTER_THRESHOLD) && (
        <div className="mt-1 flex justify-end px-2">
          {error ? (
            <span className="text-[11px] text-red-300">{error}</span>
          ) : (
            <span className={`text-[11px] tabular-nums ${remaining < 0 ? "text-red-300" : "text-slate-500"}`}>
              {remaining} tecken kvar
            </span>
          )}
        </div>
      )}

      {/* Kompakt popover med de senaste meddelandena */}
      {open && recent.length > 0 && (
        <div
          ref={popRef}
          className="absolute left-0 right-0 top-full z-50 mt-2 animate-fade-in overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(20,22,26,0.96)] shadow-xl backdrop-blur sm:max-w-md"
        >
          <ol className="max-h-72 space-y-1.5 overflow-y-auto p-2">
            {recent.map((e) => (
              <li key={e.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-200">{e.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{relativeTime(e.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs text-slate-300">{e.message}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
