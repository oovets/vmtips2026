"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// --- Typer som speglar API-svaren ------------------------------------------

interface SessionRow {
  sessionId: string;
  displayName: string | null;
  ip: string | null;
  ipReverse: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  org: string | null;
  userAgent: string | null;
  referrer: string | null;
  landingPath: string | null;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface EventRow {
  id: string;
  type: "PAGEVIEW" | "CLICK" | "INPUT_FOCUS" | "SUBMIT" | "NAV";
  path: string | null;
  targetTag: string | null;
  targetText: string | null;
  elementLabel: string | null;
  selector: string | null;
  metadata: unknown;
  createdAt: string;
}

interface Summary {
  totalSessions: number;
  totalEvents: number;
  uniqueIps: number;
  topPaths: { path: string; count: number }[];
  topCountries: { country: string; countryCode: string | null; count: number }[];
}

const PAGE_SIZE = 50;

// --- Hjälpare ---------------------------------------------------------------

// Relativ tidsangivelse på svenska, t.ex. "nyss", "3 min sedan". Speglar
// formatet i Klotterplank.tsx.
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

// Absolut tid i svensk lokal tid (Europe/Stockholm).
function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Stockholm",
  });
}

// Två-bokstavs ISO-landskod -> flagg-emoji via regionala indikatorsymboler.
function flagEmoji(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  const base = 0x1f1e6;
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}

// Kort webbläsar-/OS-sammanfattning ur user agent. Defensiv: returnerar null
// om inget känns igen.
function shortAgent(ua: string | null): string | null {
  if (!ua) return null;
  let os: string | null = null;
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser: string | null = null;
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function locationLabel(s: SessionRow): string {
  const parts = [s.city, s.region, s.country].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "Okänd plats";
}

const EVENT_BADGE: Record<EventRow["type"], { label: string; cls: string }> = {
  PAGEVIEW: { label: "Sidvisning", cls: "bg-sky-500/15 text-sky-300" },
  CLICK: { label: "Klick", cls: "bg-pitch-500/15 text-pitch-200" },
  INPUT_FOCUS: { label: "Fokus", cls: "bg-amber-500/15 text-amber-300" },
  SUBMIT: { label: "Skicka", cls: "bg-flag-500/15 text-flag-100" },
  NAV: { label: "Navigering", cls: "bg-violet-500/15 text-violet-300" },
};

// --- Komponent --------------------------------------------------------------

export function AdminLogs() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Söktermen debounce:as så vi inte spammar API:t vid varje tangenttryck.
  useEffect(() => {
    const t = setTimeout(() => setActiveQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/admin/logs/summary", { signal });
      if (res.ok) setSummary((await res.json()) as Summary);
    } catch {
      // tyst — översiktsremsan är frivillig
    }
  }, []);

  const loadSessions = useCallback(
    async (q: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
        if (q) params.set("q", q);
        const res = await fetch(`/api/admin/logs/sessions?${params}`, { signal });
        if (!res.ok) {
          setError("Inga loggar tillgängliga än.");
          setSessions([]);
          setHasMore(false);
          return;
        }
        const data = (await res.json()) as { sessions: SessionRow[]; hasMore: boolean };
        setSessions(data.sessions ?? []);
        setHasMore(Boolean(data.hasMore));
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("Inga loggar tillgängliga än.");
        setSessions([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    loadSummary(ctrl.signal);
    return () => ctrl.abort();
  }, [loadSummary]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadSessions(activeQuery, ctrl.signal);
    return () => ctrl.abort();
  }, [activeQuery, loadSessions]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(sessions.length) });
      if (activeQuery) params.set("q", activeQuery);
      const res = await fetch(`/api/admin/logs/sessions?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionRow[]; hasMore: boolean };
        setSessions((prev) => [...prev, ...(data.sessions ?? [])]);
        setHasMore(Boolean(data.hasMore));
      }
    } catch {
      // behåll befintlig lista tyst
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      {summary && (summary.totalSessions > 0 || summary.totalEvents > 0) && (
        <SummaryStrip summary={summary} />
      )}

      {/* Sök */}
      <div className="card p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input w-full"
          placeholder="Sök IP, stad eller användare…"
          aria-label="Sök i loggar"
        />
      </div>

      {/* Sessionslista */}
      {loading ? (
        <p className="rounded-lg bg-white/5 px-4 py-6 text-center text-sm text-slate-400">Laddar…</p>
      ) : error ? (
        <p className="rounded-lg bg-white/5 px-4 py-6 text-center text-sm text-slate-400">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="rounded-lg bg-white/5 px-4 py-6 text-center text-sm text-slate-400">
          {activeQuery ? "Inga sessioner matchar sökningen." : "Inga sessioner loggade än."}
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionCard
              key={s.sessionId}
              session={s}
              open={expanded === s.sessionId}
              onToggle={() => setExpanded((cur) => (cur === s.sessionId ? null : s.sessionId))}
            />
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-ghost w-full min-h-[44px]"
            >
              {loadingMore ? "Laddar…" : "Ladda fler"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: Summary }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Sessioner" value={summary.totalSessions} />
        <Stat label="Händelser" value={summary.totalEvents} />
        <Stat label="Unika IP" value={summary.uniqueIps} />
      </div>
      {(summary.topPaths.length > 0 || summary.topCountries.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summary.topPaths.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Topp-sidor</p>
              <ul className="space-y-1">
                {summary.topPaths.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">{p.path}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.topCountries.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Topp-länder</p>
              <ul className="space-y-1">
                {summary.topCountries.map((c) => (
                  <li key={c.country} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">
                      <span className="mr-1">{flagEmoji(c.countryCode)}</span>
                      {c.country}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <p className="text-lg font-bold tabular-nums text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function SessionCard({
  session,
  open,
  onToggle,
}: {
  session: SessionRow;
  open: boolean;
  onToggle: () => void;
}) {
  const agent = shortAgent(session.userAgent);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full min-h-[44px] items-start gap-3 px-3 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <span className="mt-0.5 text-xl leading-none">{flagEmoji(session.countryCode)}</span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-200">{locationLabel(session)}</span>
            <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
              {session.eventCount} händelser
            </span>
          </div>
          <p className="truncate text-xs text-slate-400">
            <span className="font-medium text-slate-300">{session.displayName ?? "Anonym"}</span>
            {session.ip ? <span className="ml-1 break-all font-mono">{session.ip}</span> : null}
          </p>
          {session.ipReverse && (
            <p className="truncate text-[11px] text-slate-500">{session.ipReverse}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-slate-500">{relativeTime(session.lastSeen)}</p>
          <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && <SessionDetail session={session} agent={agent} />}
    </div>
  );
}

function SessionDetail({ session, agent }: { session: SessionRow; agent: string | null }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(
          `/api/admin/logs/events?sessionId=${encodeURIComponent(session.sessionId)}&order=asc`,
          { signal: ctrl.signal },
        );
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json()) as { events: EventRow[] };
        setEvents(data.events ?? []);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [session.sessionId]);

  return (
    <div className="border-t border-white/10 bg-night-950/40 px-3 py-3">
      {/* Sessionsmetadata */}
      <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <MetaRow label="ISP / Org" value={[session.isp, session.org].filter(Boolean).join(" · ") || null} />
        <MetaRow label="Webbläsare" value={agent} />
        <MetaRow label="Landningssida" value={session.landingPath} mono />
        <MetaRow label="Referrer" value={session.referrer} mono />
        <MetaRow label="Första sikt" value={absoluteTime(session.firstSeen)} />
        <MetaRow label="Senast sedd" value={absoluteTime(session.lastSeen)} />
      </dl>
      {session.userAgent && (
        <p className="mb-3 break-all text-[11px] text-slate-600">{session.userAgent}</p>
      )}

      {/* Händelseström */}
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Händelseström</p>
      {loading ? (
        <p className="py-3 text-center text-xs text-slate-500">Laddar…</p>
      ) : failed ? (
        <p className="py-3 text-center text-xs text-slate-500">Inga loggar tillgängliga än.</p>
      ) : !events || events.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-500">Inga händelser i denna session.</p>
      ) : (
        <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {events.map((e) => (
            <EventItem key={e.id} event={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{label}:</dt>
      <dd className={`min-w-0 break-all text-slate-300 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function EventItem({ event }: { event: EventRow }) {
  const badge = EVENT_BADGE[event.type] ?? { label: event.type, cls: "bg-white/10 text-slate-300" };
  const label = event.elementLabel || event.targetText || event.selector || null;

  return (
    <li className="rounded-lg bg-white/[0.03] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        {event.path && <span className="truncate font-mono text-[11px] text-slate-400">{event.path}</span>}
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-500">
          {absoluteTime(event.createdAt)}
        </span>
      </div>
      {label && <p className="mt-1 break-words text-xs text-slate-300">{label}</p>}
      {event.targetTag && !label && (
        <p className="mt-1 text-[11px] text-slate-500">&lt;{event.targetTag}&gt;</p>
      )}
    </li>
  );
}
