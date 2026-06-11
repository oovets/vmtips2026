"use client";

import { useEffect, useRef, useState } from "react";
import { useEscapeToClose } from "@/hooks/useEscapeToClose";

interface TeamTag {
  code: string;
  flag: string;
  name: string;
}
interface SearchHit {
  name: string;
  team: TeamTag | null;
  source: "events" | "profile" | "both";
  goals: number;
  cards: number;
}
type EventKind = "GOAL" | "PENALTY" | "OWN_GOAL" | "ASSIST" | "YELLOW" | "RED" | "YELLOW_RED";
interface PlayerEvent {
  kind: EventKind;
  minute: number | null;
  matchNumber: number;
  stage: string;
  stageTitle: string;
  round: string;
  team: TeamTag | null;
  opponent: TeamTag | null;
  related: string | null;
}
interface PlayerStats {
  name: string;
  team: TeamTag | null;
  profile: PlayerProfile | null;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesWithEvents: number;
  events: PlayerEvent[];
}
interface PlayerProfile {
  source: "sweden-squad";
  team: TeamTag;
  position: string;
  number: number | null;
  age: number | null;
  club: string;
  clubNat: string;
  caps: number;
  nationalGoals: number;
  captain: boolean;
  viceCaptain: boolean;
}

const tag = (t: TeamTag | null) => (t ? `${t.flag} ${t.code}` : "–");

const EVENT_META: Record<EventKind, { icon: string; label: string }> = {
  GOAL: { icon: "⚽", label: "Mål" },
  PENALTY: { icon: "⚽", label: "Straffmål" },
  OWN_GOAL: { icon: "🥅", label: "Självmål" },
  ASSIST: { icon: "🅰️", label: "Assist" },
  YELLOW: { icon: "🟨", label: "Gult kort" },
  RED: { icon: "🟥", label: "Rött kort" },
  YELLOW_RED: { icon: "🟨🟥", label: "Gult + gult (rött)" },
};

export function PlayerSearch({
  onDropdownOpenChange,
}: {
  onDropdownOpenChange?: (open: boolean) => void;
} = {}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false); // dropdown öppen
  const [selected, setSelected] = useState<string | null>(null); // valt spelarnamn (öppnar modal)
  const boxRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(open, () => setOpen(false));

  // Debouncad live-sökning mot API:t.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setHits([]);
        } else {
          const data = (await res.json()) as { results?: SearchHit[] };
          setHits(data.results ?? []);
        }
      } catch {
        // avbruten/nätverksfel — behåll tidigare träffar tyst
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]);

  // Stäng dropdown vid klick utanför.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const showDropdown = open && query.trim().length > 0;

  useEffect(() => {
    onDropdownOpenChange?.(showDropdown);
  }, [onDropdownOpenChange, showDropdown]);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Sök spelare…"
          aria-label="Sök spelare"
          autoComplete="off"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-pitch-500/50 focus:bg-white/[0.06]"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-40 mt-1.5 max-h-80 w-full overflow-auto rounded-xl border border-white/10 bg-night-900 py-1 shadow-2xl">
          {searching && hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">Söker…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">
              Inga spelare matchar ”{query.trim()}” i den inrapporterade matchdatan än.
            </p>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.name}-${h.team?.code ?? ""}`}
                onClick={() => {
                  setSelected(h.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/5"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-200">{h.name}</span>
                  {h.team && <span className="ml-2 text-slate-500">{tag(h.team)}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {h.goals > 0 && <span className="text-pitch-300">{h.goals} mål</span>}
                  {h.goals > 0 && h.cards > 0 && <span className="text-slate-600"> · </span>}
                  {h.cards > 0 && <span>{h.cards} kort</span>}
                  {h.goals === 0 && h.cards === 0 && (
                    <span className={h.source === "profile" ? "text-flag-300" : "text-slate-600"}>
                      {h.source === "profile" ? "trupprofil" : "inga händelser"}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {selected && <PlayerModal name={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PlayerModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(name)}`, { signal: ctrl.signal });
        if (res.status === 404) {
          setNotFound(true);
        } else if (res.ok) {
          setData((await res.json()) as PlayerStats);
        } else {
          setNotFound(true);
        }
      } catch {
        // avbruten — ignorera
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [name]);

  useEscapeToClose(true, onClose);

  const hasAny =
    data &&
    (data.goals > 0 ||
      data.ownGoals > 0 ||
      data.assists > 0 ||
      data.yellowCards > 0 ||
      data.redCards > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Statistik för ${name}`}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 bg-night-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-extrabold">{data?.name ?? name}</h2>
            <p className="text-xs text-slate-400">
              {data?.team ? `${tag(data.team)} · ` : ""}{data?.profile ? "Profil och VM-händelser" : "Statistik hittills i turneringen"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Laddar statistik…</p>
        ) : notFound || !data ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Inga mål eller kort registrerade än för {name}.
          </p>
        ) : (
          <div className="space-y-4">
            {data.profile && (
              <div className="card grid grid-cols-2 gap-2 p-3 text-xs sm:grid-cols-4">
                <ProfileStat label="Position" value={data.profile.position} />
                <ProfileStat label="Nummer" value={data.profile.number != null ? `#${data.profile.number}` : "—"} />
                <ProfileStat label="Ålder" value={data.profile.age != null ? `${data.profile.age} år` : "—"} />
                <ProfileStat label="Klubb" value={`${data.profile.club} (${data.profile.clubNat})`} />
                <ProfileStat label="Landskamper" value={`${data.profile.caps}`} />
                <ProfileStat label="Landslagsmål" value={`${data.profile.nationalGoals}`} />
                {(data.profile.captain || data.profile.viceCaptain) && (
                  <ProfileStat label="Roll" value={data.profile.captain ? "Lagkapten" : "Vice kapten"} />
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Stat label="Mål" value={data.goals} hint={data.penaltyGoals > 0 ? `varav ${data.penaltyGoals} straff` : undefined} />
              <Stat label="Assist" value={data.assists} />
              <Stat label="Självmål" value={data.ownGoals} />
              <Stat label="Gula" value={data.yellowCards} />
              <Stat label="Röda" value={data.redCards} />
            </div>

            <p className="text-[11px] text-slate-500">
              Bygger på {data.matchesWithEvents} match{data.matchesWithEvents === 1 ? "" : "er"} där spelaren
              förekommer i mål-/korthändelser. Vi lagrar inte laguppställningar, så detta är inte antal spelade
              matcher.
            </p>

            {!hasAny ? (
              <p className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-4 text-center text-sm text-slate-400">
                Inga mål eller kort registrerade än i VM 2026.
              </p>
            ) : (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Händelser</h3>
                <ol className="space-y-1.5">
                  {data.events.map((ev, i) => {
                    const meta = EVENT_META[ev.kind];
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                      >
                        <span className="shrink-0 text-base leading-none" aria-hidden>{meta.icon}</span>
                        <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-300">
                          {ev.minute != null ? `${ev.minute}'` : "–"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-200">
                            {meta.label}
                            {ev.related && (
                              <span className="text-slate-500">
                                {ev.kind === "ASSIST" ? " (mål: " : " (assist: "}
                                {ev.related})
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {ev.stageTitle} · mot {tag(ev.opponent)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <p className="text-[10px] text-slate-600">
              VM-statistiken bygger på inrapporterade matchhändelser (mål och kort) och fylls på allt eftersom matcherna spelas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-2.5 text-center">
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      {hint && <div className="text-[9px] text-slate-600">{hint}</div>}
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate font-semibold text-slate-200" title={value}>{value}</div>
    </div>
  );
}
