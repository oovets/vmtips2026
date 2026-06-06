"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface LeagueEntry { userId: string; leagueName: string; }

interface Props {
  user: { displayName: string; leagueName: string; joinCode: string } | null;
  isAdminLoggedIn: boolean;
  allLeagues: LeagueEntry[];
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

const baseLinks = [
  { href: "/dashboard",     label: "Översikt",  icon: <IconDashboard /> },
  { href: "/mitt-lag",      label: "Mitt tips", icon: <IconTips /> },
  { href: "/leaderboard",   label: "Topplista", icon: <IconLeaderboard /> },
  { href: "/matcher",       label: "Matcher",   icon: <IconMatches /> },
  { href: "/grupper",       label: "Grupper",   icon: <IconGroups /> },
  { href: "/installningar", label: "Inst.",     icon: <IconSettings /> },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

export function Nav({ user, isAdminLoggedIn, allLeagues }: Props) {
  const isActive = useActive();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyCode(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const navLinks = isAdminLoggedIn
    ? [...baseLinks, { href: "/admin", label: "Admin", icon: <IconAdmin /> }]
    : baseLinks;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function switchLeague(userId: string) {
    setSwitching(true);
    setShowLeagues(false);
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
          <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight">
            <span className="hidden sm:inline font-heading text-white">VM-tips 2026</span>
          </Link>

          {user && (
            <nav className="hidden flex-1 items-center gap-1 sm:flex">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive(l.href) ? "bg-flag-500/20 text-flag-500 font-semibold" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {user ? (
              <>
                {/* Liga-switcher */}
                <div className="relative min-w-0 text-right">
                  <button
                    onClick={() => setShowLeagues((v) => !v)}
                    disabled={switching}
                    className="min-w-0 text-right"
                  >
                    <div className="truncate text-sm font-semibold leading-tight">{user.displayName}</div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyCode(user.joinCode); }}
                        title="Kopiera inbjudningslänk"
                        className="truncate text-xs text-slate-400 hover:text-flag-500 transition"
                      >
                        {copied ? "länk kopierad!" : user.leagueName}
                      </button>
                      {allLeagues.length > 1 && (
                        <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-slate-500">
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                  {showLeagues && allLeagues.length > 1 && (
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-xl border border-white/10 bg-night-900 shadow-xl">
                      {allLeagues.map((l) => (
                        <button
                          key={l.userId}
                          onClick={() => switchLeague(l.userId)}
                          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-white/5 first:rounded-t-xl last:rounded-b-xl ${
                            l.leagueName === user.leagueName ? "text-flag-500 font-semibold" : "text-slate-200"
                          }`}
                        >
                          {l.leagueName}
                          {l.leagueName === user.leagueName && (
                            <span className="ml-auto text-xs text-flag-500">aktiv</span>
                          )}
                        </button>
                      ))}
                      <div className="border-t border-white/10" />
                      <Link
                        href="/ny-liga"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-white/5 rounded-b-xl"
                        onClick={() => setShowLeagues(false)}
                      >
                        + Ny liga
                      </Link>
                    </div>
                  )}
                </div>
                <button onClick={logout} className="btn-ghost btn-sm shrink-0 border-0">
                  Logga ut
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (window.location.pathname !== "/") {
                    window.location.href = "/#auth";
                  } else {
                    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                className="btn-yellow btn-sm"
              >
                Logga in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Bottenmeny – mobil */}
      {user && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-950/95 backdrop-blur sm:hidden">
          <div
            className="mx-auto grid max-w-6xl"
            style={{ gridTemplateColumns: `repeat(${navLinks.length}, minmax(0, 1fr))` }}
          >
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                  isActive(l.href) ? "text-flag-500" : "text-slate-400"
                }`}
              >
                {l.icon}
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
