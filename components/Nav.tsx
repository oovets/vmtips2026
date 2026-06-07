"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WeatherWidget } from "@/components/WeatherWidget";
import type { WeatherInfo } from "@/lib/weather";

interface LeagueEntry { userId: string; leagueName: string; }

interface Props {
  user: {
    displayName: string;
    leagueName: string;
    joinCode: string;
    rank?: number | null;
    trend?: "up" | "down" | "flat" | null;
  } | null;
  isAdminLoggedIn: boolean;
  allLeagues: LeagueEntry[];
  weather?: { items: WeatherInfo[]; isToday: boolean };
  needsSubmit?: boolean; // spelaren har inte lämnat in sitt lag (och tipsen är inte låsta än)
}

// Liten placeringsindikator: #N + grön upp-/röd ner-pil. Ingen pil vid neutral
// trend (ingen historik) eller flat. Endast för inloggade. Trenden kommer från
// persisterad previousRank vs currentRank — aldrig påhittad.
function PlacementBadge({
  rank,
  trend,
}: {
  rank: number;
  trend?: "up" | "down" | "flat" | null;
}) {
  const label =
    trend === "up"
      ? `Placering ${rank} i ligan, klättrat`
      : trend === "down"
        ? `Placering ${rank} i ligan, tappat`
        : `Placering ${rank} i ligan`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-200"
      title={label}
      aria-label={label}
    >
      #{rank}
      {trend === "up" && <span className="text-green-400" aria-hidden="true">▲</span>}
      {trend === "down" && <span className="text-red-400" aria-hidden="true">▼</span>}
    </span>
  );
}

// ── Nav icons ─────────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Dashboard tiles */}
      <rect x="3" y="3" width="6" height="6" rx="1.2"/>
      <rect x="11" y="3" width="6" height="4" rx="1.2"/>
      <rect x="3" y="11" width="6" height="4" rx="1.2"/>
      <rect x="11" y="9" width="6" height="6" rx="1.2"/>
    </svg>
  );
}

function IconTips() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Paper with dog-ear */}
      <path d="M5 4h7l3 3v10a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/>
      <path d="M12 4v3h3"/>
      {/* Text lines */}
      <line x1="7" y1="9" x2="12" y2="9"/>
      <line x1="7" y1="12" x2="10" y2="12"/>
    </svg>
  );
}

function IconLeaderboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Trophy cup */}
      <path d="M7 3h6v6a3 3 0 01-6 0V3z"/>
      {/* Handles */}
      <path d="M7 5H4.5a.5.5 0 00-.5.5A2.5 2.5 0 007 8"/>
      <path d="M13 5h2.5a.5.5 0 01.5.5A2.5 2.5 0 0113 8"/>
      {/* Stem + base */}
      <line x1="10" y1="9" x2="10" y2="14"/>
      <line x1="7" y1="14" x2="13" y2="14"/>
      {/* Star in cup */}
      <path d="M10 5l.6 1.8H12l-1.3.9.5 1.8L10 8.6l-1.2.9.5-1.8L8 6.8h1.4z" strokeWidth="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IconMatches() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Calendar frame */}
      <rect x="3" y="4" width="14" height="13" rx="1.5"/>
      {/* Header separator */}
      <line x1="3" y1="8.5" x2="17" y2="8.5"/>
      {/* Pin knobs */}
      <line x1="7" y1="2.5" x2="7" y2="5.5"/>
      <line x1="13" y1="2.5" x2="13" y2="5.5"/>
      {/* Date dots */}
      <circle cx="7" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="13" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="7" cy="14.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="14.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IconGroups() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Table border */}
      <rect x="2.5" y="3" width="15" height="14" rx="1.5"/>
      {/* Header row */}
      <line x1="2.5" y1="7.5" x2="17.5" y2="7.5"/>
      {/* Data rows */}
      <line x1="2.5" y1="11.5" x2="17.5" y2="11.5"/>
      {/* Column dividers */}
      <line x1="9" y1="7.5" x2="9" y2="17"/>
      <line x1="13.5" y1="7.5" x2="13.5" y2="17"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {/* Top slider */}
      <line x1="3" y1="7" x2="6" y2="7"/>
      <circle cx="8.5" cy="7" r="2.5"/>
      <line x1="11" y1="7" x2="17" y2="7"/>
      {/* Bottom slider */}
      <line x1="3" y1="13" x2="10" y2="13"/>
      <circle cx="12.5" cy="13" r="2.5"/>
      <line x1="15" y1="13" x2="17" y2="13"/>
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Shield */}
      <path d="M10 2.5l5.5 2v4.5c0 3.8-2.8 6.5-5.5 7.5-2.7-1-5.5-3.7-5.5-7.5V4.5z"/>
      {/* Checkmark */}
      <path d="M7.5 10l2 2 3.5-3.5"/>
    </svg>
  );
}

function IconSweden() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Flaggkors */}
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <line x1="8" y1="3.5" x2="8" y2="16.5" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Hus */}
      <path d="M3 9.5l7-5.5 7 5.5" />
      <path d="M5 8.5V16a1 1 0 001 1h8a1 1 0 001-1V8.5" />
      <path d="M8.5 17v-4h3v4" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Rutnät (fler) */}
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.2" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Länk */}
      <path d="M8 12a3 3 0 010-4l2-2a3 3 0 014 4l-1 1" />
      <path d="M12 8a3 3 0 010 4l-2 2a3 3 0 01-4-4l1-1" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
      <path d="M12 14l3-4-3-4" />
      <line x1="15" y1="10" x2="8" y2="10" />
    </svg>
  );
}

function IconLogin() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4h3a1 1 0 011 1v10a1 1 0 01-1 1h-3" />
      <path d="M8 14l-3-4 3-4" />
      <line x1="5" y1="10" x2="12" y2="10" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

// `auth: true` = kräver inloggning (sidan skickar utloggade till startsidan).
// Full uppsättning länkar – används av desktop-top-navens (har gott om plats).
const baseLinks = [
  { href: "/dashboard",     label: "Översikt",  icon: <IconDashboard />,    auth: false },
  { href: "/sverige",       label: "Sverige",   icon: <IconSweden />,       auth: false },
  { href: "/mitt-lag",      label: "Mitt tips", icon: <IconTips />,         auth: true  },
  { href: "/leaderboard",   label: "Topplista", icon: <IconLeaderboard />,  auth: false },
  { href: "/matcher",       label: "Matcher",   icon: <IconMatches />,      auth: false },
  { href: "/grupper",       label: "Grupper",   icon: <IconGroups />,       auth: false },
  { href: "/installningar", label: "Inst.",     icon: <IconSettings />,     auth: true  },
];

// Mobil bottenmeny: exakt 5 fasta flikar oavsett auth/admin. Den sista ("Mer")
// är ingen route utan öppnar en bottensheet med sekundära destinationer.
const bottomTabs = [
  { href: "/dashboard",   label: "Hem",       icon: <IconHome />,        auth: false },
  { href: "/matcher",     label: "Matcher",   icon: <IconMatches />,     auth: false },
  { href: "/mitt-lag",    label: "Mitt tips", icon: <IconTips />,        auth: true  },
  { href: "/grupper",     label: "Grupper",   icon: <IconGroups />,      auth: false },
];

// Sekundära destinationer i "Mer"-sheeten (mobil).
const drawerLinks = [
  { href: "/leaderboard",   label: "Topplista",     icon: <IconLeaderboard />, auth: false },
  { href: "/sverige",       label: "Sverige",       icon: <IconSweden />,   auth: false },
  { href: "/installningar", label: "Inställningar", icon: <IconSettings />, auth: true  },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

const SUBMIT_HREF = "/mitt-lag";

// Utloggade utan tillgång till en auth-route skickas till startsidans inloggning,
// precis som den befintliga "Logga in"-knappen gör.
function goToAuth() {
  if (window.location.pathname !== "/") {
    window.location.href = "/#auth";
  } else {
    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function Nav({ user, isAdminLoggedIn, allLeagues, weather, needsSubmit }: Props) {
  const isActive = useActive();
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false); // desktop liga-dropdown
  const [showMore, setShowMore] = useState(false); // mobil "Mer"-sheet
  const [copied, setCopied] = useState(false);

  // Stäng "Mer"-sheeten vid navigering till ny route.
  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  // Esc stänger öppna ytor; lås body-scroll medan sheeten är öppen.
  useEffect(() => {
    if (!showMore) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMore(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showMore]);

  function copyCode(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Utloggade ser bara de publika flikarna; inloggade ser allt. Admin-fliken
  // tillkommer endast när den globala admin-PIN:en är aktiv. Används av
  // desktop-top-navens kompletta länklista.
  const visibleLinks = user ? baseLinks : baseLinks.filter((l) => !l.auth);
  const desktopLinks = isAdminLoggedIn
    ? [...visibleLinks, { href: "/admin", label: "Admin", icon: <IconAdmin />, auth: true }]
    : visibleLinks;

  // Sekundära destinationer i "Mer"-sheeten, filtrerade på auth + admin-gating.
  const drawerDestinations = (user ? drawerLinks : drawerLinks.filter((l) => !l.auth))
    .concat(isAdminLoggedIn ? [{ href: "/admin", label: "Admin", icon: <IconAdmin />, auth: true }] : []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function switchLeague(userId: string) {
    setSwitching(true);
    setShowLeagues(false);
    setShowMore(false);
    await fetch("/api/leagues/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    window.location.href = "/mitt-lag";
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-night-950/90 backdrop-blur">
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #006AA7 50%, #FECC00 50%)" }} />
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {/* Wordmark – synlig även på mobil */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-lg font-extrabold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
          >
            <span className="font-heading text-base text-white sm:text-lg">VM-tips 2026</span>
          </Link>

          {/* Desktop-top-nav: alla länkar (gott om plats) */}
          {desktopLinks.length > 0 && (
            <nav className="hidden flex-1 items-center gap-1 sm:flex">
              {desktopLinks.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500 ${
                      active
                        ? "bg-flag-500/20 text-flag-500 font-semibold"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    {l.label}
                    {needsSubmit && l.href === SUBMIT_HREF && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Höger-kluster: identitet, liga, väder, login/logout */}
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            {user ? (
              <>
                {weather && <WeatherWidget items={weather.items} isToday={weather.isToday} />}

                {/* Identitet + placering + liga (chevron öppnar switcher på desktop) */}
                <div className="relative min-w-0 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="truncate text-sm font-semibold leading-tight">{user.displayName}</span>
                    {user.rank != null && <PlacementBadge rank={user.rank} trend={user.trend} />}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {/* En yta = en åtgärd: liga-namnet öppnar switchern (mobil → sheet) */}
                    <button
                      onClick={() => {
                        if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
                          setShowLeagues((v) => !v);
                        } else {
                          setShowMore(true);
                        }
                      }}
                      aria-haspopup="menu"
                      aria-expanded={showLeagues}
                      title="Byt liga"
                      className="flex items-center gap-1 rounded text-xs text-slate-400 transition hover:text-flag-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                    >
                      <span className="max-w-[40vw] truncate sm:max-w-[16rem]">{user.leagueName}</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-slate-500" aria-hidden="true">
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  {/* Desktop liga-dropdown */}
                  {showLeagues && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-1 hidden min-w-[200px] rounded-xl border border-white/10 bg-night-900 shadow-xl sm:block"
                    >
                      {allLeagues.length > 1 &&
                        allLeagues.map((l) => (
                          <button
                            key={l.userId}
                            role="menuitem"
                            onClick={() => switchLeague(l.userId)}
                            disabled={switching}
                            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-white/5 first:rounded-t-xl ${
                              l.leagueName === user.leagueName ? "text-flag-500 font-semibold" : "text-slate-200"
                            }`}
                          >
                            {l.leagueName}
                            {l.leagueName === user.leagueName && (
                              <span className="ml-auto text-xs text-flag-500">aktiv</span>
                            )}
                          </button>
                        ))}
                      <button
                        role="menuitem"
                        onClick={() => { setShowLeagues(false); copyCode(user.joinCode); }}
                        className="flex w-full items-center gap-2 border-t border-white/10 px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
                      >
                        <span className="text-slate-400"><IconLink /></span>
                        {copied ? "länk kopierad!" : "Kopiera inbjudningslänk"}
                      </button>
                      <Link
                        href="/ny-liga"
                        role="menuitem"
                        onClick={() => setShowLeagues(false)}
                        className="flex w-full items-center gap-2 rounded-b-xl border-t border-white/10 px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-white/5"
                      >
                        <span className="text-slate-400"><IconPlus /></span>
                        Ny liga
                      </Link>
                    </div>
                  )}
                </div>

                {/* Logga ut – tillgänglig på desktop; på mobil ligger den i "Mer" */}
                <button
                  onClick={logout}
                  className="btn-ghost btn-sm hidden shrink-0 border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500 sm:inline-flex"
                >
                  Logga ut
                </button>
              </>
            ) : (
              <button
                onClick={goToAuth}
                className="btn-yellow btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Logga in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Uppmärksamhetsbanner: lag ej inlämnat (en enda stark kanal). Subtil puls
          endast för användare som tillåter rörelse (motion-safe). */}
      {user && needsSubmit && (
        <Link
          href={SUBMIT_HREF}
          className="block border-b border-amber-400/40 bg-amber-500/15 px-4 py-2 text-center text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25 motion-safe:animate-attention-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <span className="mr-1.5" aria-hidden="true">⚠️</span>
          Du har inte lämnat in ditt lag än — klicka här för att slutföra innan tipsen låses.
        </Link>
      )}

      {/* Bottenmeny – mobil: exakt 5 fasta flikar */}
      <nav
        aria-label="Huvudnavigering"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-950/95 backdrop-blur sm:hidden"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-5">
          {bottomTabs.map((t) => {
            const active = isActive(t.href);
            const showDot = needsSubmit && t.href === SUBMIT_HREF;
            const requiresAuth = t.auth && !user;
            const className = `relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flag-500 ${
              active ? "text-flag-500" : "text-slate-400"
            }`;
            const inner = (
              <>
                {active && (
                  <span
                    className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-flag-500"
                    aria-hidden="true"
                  />
                )}
                <span className="relative">
                  {t.icon}
                  {showDot && (
                    <span
                      className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-night-950"
                      aria-hidden="true"
                    />
                  )}
                </span>
                {t.label}
              </>
            );
            // Auth-fliken (Mitt tips) skickar utloggade till startsidans inloggning.
            return requiresAuth ? (
              <button
                key={t.href}
                onClick={goToAuth}
                aria-label={`${t.label} (kräver inloggning)`}
                className={className}
              >
                {inner}
              </button>
            ) : (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {inner}
              </Link>
            );
          })}

          {/* Femte fliken: "Mer" – öppnar bottensheet, ingen route */}
          <button
            onClick={() => setShowMore(true)}
            aria-haspopup="dialog"
            aria-expanded={showMore}
            className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flag-500 ${
              showMore ? "text-flag-500" : "text-slate-400"
            }`}
          >
            <span className="relative"><IconMore /></span>
            Mer
          </button>
        </div>
      </nav>

      {/* "Mer"-sheet – mobil bottensheet */}
      {showMore && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mer"
        >
          <button
            aria-label="Stäng"
            onClick={() => setShowMore(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="card relative w-full max-h-[80vh] overflow-y-auto rounded-b-none rounded-t-2xl border-x-0 border-b-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {/* Sheet-handtag + stäng */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[rgba(20,22,26,0.95)] px-4 py-3 backdrop-blur">
              <h2 className="font-heading text-base font-extrabold text-white">Mer</h2>
              <button
                onClick={() => setShowMore(false)}
                aria-label="Stäng"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="px-3 py-3">
              {/* Sekundära destinationer */}
              <ul className="space-y-1">
                {drawerDestinations.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500 ${
                          active ? "bg-flag-500/15 text-flag-500" : "text-slate-200 hover:bg-white/5"
                        }`}
                      >
                        <span className={active ? "text-flag-500" : "text-slate-400"}>{l.icon}</span>
                        <span className="flex-1">{l.label}</span>
                        <IconChevronRight />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Liga-sektion (endast inloggade) */}
              {user && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Liga</div>
                  <ul className="space-y-1">
                    {allLeagues.length > 1 ? (
                      allLeagues.map((l) => (
                        <li key={l.userId}>
                          <button
                            onClick={() => switchLeague(l.userId)}
                            disabled={switching}
                            className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500 ${
                              l.leagueName === user.leagueName ? "bg-flag-500/15 text-flag-500 font-semibold" : "text-slate-200 hover:bg-white/5"
                            }`}
                          >
                            <span className="flex-1 truncate">{l.leagueName}</span>
                            {l.leagueName === user.leagueName && <span className="text-xs text-flag-500">aktiv</span>}
                          </button>
                        </li>
                      ))
                    ) : (
                      <li>
                        <div className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-flag-500">
                          <span className="flex-1 truncate">{user.leagueName}</span>
                          <span className="text-xs text-flag-500">aktiv</span>
                        </div>
                      </li>
                    )}
                    <li>
                      <Link
                        href="/ny-liga"
                        className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                      >
                        <span className="text-slate-400"><IconPlus /></span>
                        <span className="flex-1">Ny liga</span>
                      </Link>
                    </li>
                    <li>
                      <button
                        onClick={() => copyCode(user.joinCode)}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                      >
                        <span className="text-slate-400"><IconLink /></span>
                        <span className="flex-1">{copied ? "länk kopierad!" : "Kopiera inbjudningslänk"}</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {/* Konto: logga ut / logga in */}
              <div className="mt-4 border-t border-white/10 pt-3">
                {user ? (
                  <button
                    onClick={logout}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                  >
                    <span className="text-slate-400"><IconLogout /></span>
                    <span className="flex-1">Logga ut</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowMore(false); goToAuth(); }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag-500"
                  >
                    <span className="text-slate-400"><IconLogin /></span>
                    <span className="flex-1">Logga in</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
