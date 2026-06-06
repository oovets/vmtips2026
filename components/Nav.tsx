"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  user: { displayName: string; isAdmin: boolean; leagueName: string } | null;
}

const links = [
  { href: "/mitt-lag", label: "Mitt lag", icon: "⚽" },
  { href: "/leaderboard", label: "Topplista", icon: "🏆" },
  { href: "/matcher", label: "Matcher", icon: "📅" },
  { href: "/grupper", label: "Grupper", icon: "📊" },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

export function Nav({ user }: Props) {
  const isActive = useActive();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const navLinks = user?.isAdmin
    ? [...links, { href: "/admin", label: "Admin", icon: "🛠️" }]
    : links;

  return (
    <>
      {/* Toppbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-night-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight">
            <span className="text-xl">⚽</span>
            <span className="hidden sm:inline">VM-tips 2026</span>
          </Link>

          {/* Länkrad – endast desktop */}
          {user && (
            <nav className="hidden flex-1 items-center gap-1 sm:flex">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive(l.href)
                      ? l.href === "/admin"
                        ? "bg-amber-500/20 text-amber-100"
                        : "bg-pitch-500/20 text-pitch-100"
                      : "text-slate-300 hover:bg-white/5"
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
                <div className="min-w-0 text-right">
                  <div className="truncate text-sm font-semibold leading-tight">{user.displayName}</div>
                  <div className="truncate text-xs text-slate-400">{user.leagueName}</div>
                </div>
                <button onClick={logout} className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
                  Logga ut
                </button>
              </>
            ) : (
              <Link href="/" className="btn-primary py-1.5 text-xs">
                Logga in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Bottenmeny – endast mobil */}
      {user && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-950/95 backdrop-blur sm:hidden">
          <div
            className="mx-auto grid max-w-6xl"
            style={{ gridTemplateColumns: `repeat(${navLinks.length}, minmax(0, 1fr))` }}
          >
            {navLinks.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                    active ? "text-pitch-300" : "text-slate-400"
                  }`}
                >
                  <span className={`text-lg leading-none ${active ? "scale-110" : ""} transition`}>{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
