"use client";

// Klientspårare för användarsessioner. Loggar MENINGSFULLA interaktioner (klick på
// knappar/länkar/flikar, fokus på formulärfält, formulärinlämning) samt sidvisningar
// vid route-byten. Batchar händelser i minnet och flushar periodiskt + vid
// visibilitychange/pagehide via navigator.sendBeacon (fallback fetch keepalive).
//
// INTEGRITET: vi loggar ALDRIG värden som skrivs i fält — endast att ett fält
// fokuserats samt dess name/label/typ. Lösenords- och PIN-fält undantas helt
// (ingen text, ingen label härledd från värdet). Spåraren får aldrig blockera UI
// eller kasta fel — allt är inkapslat i try/catch.

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type EventType = "PAGEVIEW" | "CLICK" | "INPUT_FOCUS" | "SUBMIT" | "NAV";

interface TrackedEvent {
  type: EventType;
  path: string | null;
  targetTag?: string | null;
  targetText?: string | null;
  targetId?: string | null;
  selector?: string | null;
  elementLabel?: string | null;
  x?: number | null;
  y?: number | null;
  metadata?: Record<string, unknown> | null;
  ts: number;
}

const STORAGE_KEY = "vmtips_sid";
const COOKIE_KEY = "vmtips_sid";
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER = 50;
const TEXT_MAX = 200;

// Element vars klick räknas som en meningsfull interaktion.
const MEANINGFUL_SELECTOR =
  "button, a, [role=button], [role=tab], [role=link], [role=menuitem], summary, input, select, textarea, label";

// Fält vars innehåll/etikett ALDRIG får loggas (känsligt).
function isSensitiveField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return false;
  const input = el as HTMLInputElement;
  const type = (input.type || "").toLowerCase();
  if (type === "password") return true;
  const name = (input.name || "").toLowerCase();
  const id = (input.id || "").toLowerCase();
  const autocomplete = (input.getAttribute("autocomplete") || "").toLowerCase();
  const haystack = `${name} ${id} ${autocomplete}`;
  // PIN, lösenord, kod m.m. — uteslut allt som rör inloggning/PIN.
  return /pin|pass|lösen|losen|secret|otp|code|kod/.test(haystack);
}

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* faller igenom */
  }
  // Fallback (RFC4122 v4-liknande) om randomUUID saknas.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  try {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; samesite=lax`;
  } catch {
    /* ignorera */
  }
}

// Hämtar eller skapar ett stabilt sessionId. localStorage primärt, cookie som
// fallback (och spegling) så det överlever även om localStorage saknas.
function getSessionId(): string {
  let sid: string | null = null;
  try {
    sid = localStorage.getItem(STORAGE_KEY);
  } catch {
    sid = null;
  }
  if (!sid) sid = readCookie(COOKIE_KEY);
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) sid = uuid();
  try {
    localStorage.setItem(STORAGE_KEY, sid);
  } catch {
    /* ignorera */
  }
  writeCookie(COOKIE_KEY, sid);
  return sid;
}

function truncate(s: string | null | undefined, max = TEXT_MAX): string | null {
  if (!s) return null;
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// Lättviktig CSS-selektor-väg (max ~4 nivåer) för att identifiera elementet.
function cssPath(el: Element): string | null {
  try {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && depth < 4 && node.nodeType === 1) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${node.id}`;
        parts.unshift(part);
        break;
      }
      const cls = (node.getAttribute("class") || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      if (cls) part += `.${cls}`;
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ").slice(0, 512) || null;
  } catch {
    return null;
  }
}

// Härleder en synlig etikett utan att läcka fältvärden.
function elementLabel(el: HTMLElement): string | null {
  const aria = el.getAttribute("aria-label");
  if (aria) return truncate(aria);
  const title = el.getAttribute("title");
  if (title) return truncate(title);
  // För knappar/länkar: synlig text (aldrig från input-värden).
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return null;
  }
  return truncate(el.textContent);
}

export function SessionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sessionId = useRef<string | null>(null);
  const buffer = useRef<TrackedEvent[]>([]);
  const referrer = useRef<string | null>(null);
  const landingPath = useRef<string | null>(null);
  const lastPageview = useRef<string | null>(null);

  // --- Buffert + flush ---
  const flush = useRef<(useBeacon?: boolean) => void>(() => {});

  useEffect(() => {
    sessionId.current = getSessionId();
    try {
      referrer.current = document.referrer || null;
      landingPath.current = window.location.pathname + window.location.search;
    } catch {
      /* ignorera */
    }

    const send = (useBeacon = false) => {
      try {
        if (!sessionId.current) return;
        if (buffer.current.length === 0) return;
        const events = buffer.current.splice(0, MAX_BUFFER);
        const payload = {
          sessionId: sessionId.current,
          referrer: referrer.current,
          landingPath: landingPath.current,
          events,
        };
        const body = JSON.stringify(payload);

        if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          const ok = navigator.sendBeacon("/api/track", blob);
          if (ok) return;
          // sendBeacon misslyckades — lägg tillbaka och försök via fetch nedan.
          buffer.current.unshift(...events);
        }

        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          /* svälj nätverksfel */
        });
      } catch {
        /* spåraren får aldrig kasta */
      }
    };
    flush.current = send;

    const enqueue = (ev: Omit<TrackedEvent, "ts" | "path"> & { path?: string | null }) => {
      try {
        let path: string | null = ev.path ?? null;
        if (path === undefined || path === null) {
          path = typeof window !== "undefined" ? window.location.pathname + window.location.search : null;
        }
        buffer.current.push({ ...ev, path, ts: Date.now() });
        if (buffer.current.length >= MAX_BUFFER) send(false);
      } catch {
        /* ignorera */
      }
    };

    // --- Delegerad klick-lyssnare ---
    const onClick = (e: MouseEvent) => {
      try {
        const target = e.target as Element | null;
        const el = target?.closest?.(MEANINGFUL_SELECTOR) as HTMLElement | null;
        if (!el) return;
        const sensitive = isSensitiveField(el);
        enqueue({
          type: "CLICK",
          targetTag: el.tagName.toLowerCase(),
          targetText: sensitive ? null : elementLabel(el),
          targetId: el.id || el.getAttribute("name") || null,
          selector: cssPath(el),
          elementLabel: sensitive ? null : elementLabel(el),
          x: Number.isFinite(e.clientX) ? Math.round(e.clientX) : null,
          y: Number.isFinite(e.clientY) ? Math.round(e.clientY) : null,
          metadata: { role: el.getAttribute("role") || null },
        });
      } catch {
        /* ignorera */
      }
    };

    // --- Fokus på formulärfält (INPUT_FOCUS) — aldrig värdet ---
    const onFocusIn = (e: FocusEvent) => {
      try {
        const target = e.target as Element | null;
        if (!target) return;
        const tag = target.tagName.toLowerCase();
        if (tag !== "input" && tag !== "select" && tag !== "textarea") return;
        const sensitive = isSensitiveField(target);
        const input = target as HTMLInputElement;
        enqueue({
          type: "INPUT_FOCUS",
          targetTag: tag,
          // Aldrig fältets värde. För känsliga fält: inte ens name/label.
          targetText: null,
          targetId: sensitive ? null : input.name || input.id || null,
          selector: sensitive ? null : cssPath(target),
          elementLabel: sensitive ? null : elementLabel(target as HTMLElement),
          metadata: { fieldType: sensitive ? "redacted" : (input.type || tag) },
        });
      } catch {
        /* ignorera */
      }
    };

    // --- Formulärinlämning (SUBMIT) — inga fältvärden ---
    const onSubmit = (e: Event) => {
      try {
        const form = e.target as HTMLElement | null;
        if (!form || form.tagName.toLowerCase() !== "form") return;
        enqueue({
          type: "SUBMIT",
          targetTag: "form",
          targetId: (form as HTMLFormElement).getAttribute("name") || form.id || null,
          selector: cssPath(form),
          elementLabel: elementLabel(form),
        });
      } catch {
        /* ignorera */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    const onPageHide = () => send(true);

    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    const interval = setInterval(() => send(false), FLUSH_INTERVAL_MS);

    return () => {
      try {
        send(true);
      } catch {
        /* ignorera */
      }
      clearInterval(interval);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // --- Sidvisning vid route-byte ---
  useEffect(() => {
    try {
      if (!sessionId.current) return;
      const qs = searchParams?.toString();
      const path = qs ? `${pathname}?${qs}` : pathname;
      if (!path || path === lastPageview.current) return;
      lastPageview.current = path;
      buffer.current.push({ type: "PAGEVIEW", path, ts: Date.now() });
      // Skicka sidvisningar relativt snabbt så de inte tappas vid snabb navigering.
      flush.current(false);
    } catch {
      /* ignorera */
    }
  }, [pathname, searchParams]);

  return null;
}
