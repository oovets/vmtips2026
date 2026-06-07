import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter_Tight, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getCurrentUser, getAllSessionUserIds, isAdminAuthed } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Nav } from "@/components/Nav";
import { BackgroundRotator } from "@/components/BackgroundRotator";
import { SessionTracker } from "@/components/SessionTracker";
import { fetchDayWeather } from "@/lib/weather";
import { isLocked } from "@/lib/lock";
import { rankRows } from "@/lib/rank";

type Trend = "up" | "down" | "flat" | null;

// Placering + trend för inloggad spelare. Använder persisterad currentRank/
// previousRank (riktig data som skiftas vid varje poängomräkning). Är
// currentRank inte ifylld än (före db:push/första omräkning) faller vi tillbaka
// på en live-uträkning från ligans poäng så siffran ändå syns direkt; trenden
// blir då neutral (ingen pil) eftersom ingen historik finns.
async function getRankAndTrend(
  userId: string,
  leagueId: string,
): Promise<{ rank: number | null; trend: Trend }> {
  const myScore = await prisma.score.findUnique({
    where: { userId },
    select: { currentRank: true, previousRank: true },
  });

  if (myScore?.currentRank != null) {
    const { currentRank, previousRank } = myScore;
    const trend: Trend =
      previousRank == null
        ? null
        : currentRank < previousRank
          ? "up"
          : currentRank > previousRank
            ? "down"
            : "flat";
    return { rank: currentRank, trend };
  }

  // Live-fallback: ranka ligan på plats utifrån cachade totalpoäng.
  const leagueUsers = await prisma.user.findMany({
    where: { leagueId },
    select: { id: true, displayName: true, score: { select: { total: true } } },
  });
  const ranked = rankRows(
    leagueUsers.map((u) => ({ id: u.id, displayName: u.displayName, total: u.score?.total ?? 0 })),
  );
  const mine = ranked.find((r) => r.row.id === userId);
  return { rank: mine?.rank ?? null, trend: null };
}

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
// Plus Jakarta Sans: modern, hög läsbarhet på täta mörka gränssnitt, utmärkt stöd
// för svenska diakritiska tecken (å ä ö). display: "swap" undviker layouthopp.
const bodyFont = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "VM-tips 2026",
  description: "Tippa fotbolls-VM 2026 — matcher, grupper och slutspel. Följ ligan live.",
  appleWebApp: { capable: true, title: "VM-tips", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#006AA7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, adminOk, allIds] = await Promise.all([
    getCurrentUser(),
    isAdminAuthed(),
    getAllSessionUserIds(),
  ]);

  // Fetch league names for all session user IDs (for the league switcher)
  const allLeagues = allIds.length > 1
    ? await prisma.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true, league: { select: { name: true } } },
      }).then((rows) => rows.map((r) => ({ userId: r.id, leagueName: r.league.name })))
    : user
      ? [{ userId: user.id, leagueName: user.league.name }]
      : [];

  // Dagens väder för nav-widgeten (bara för inloggade). Tyst fallback om API:t är nere.
  const weather = user
    ? await fetchDayWeather(
        await prisma.match.findMany({ select: { kickoff: true, venue: true, status: true } }),
      )
    : { items: [], isToday: false };

  // Placering + trend för inloggad spelare (visas som liten siffra + pil i nav).
  const placement = user
    ? await getRankAndTrend(user.id, user.leagueId)
    : { rank: null, trend: null as Trend };

  return (
    <html lang="sv" className={`${inter.variable} ${bodyFont.variable}`}>
      <body className="min-h-screen font-sans">
        <Suspense fallback={null}>
          <SessionTracker />
        </Suspense>
        <BackgroundRotator />
        <Nav
          user={user ? { displayName: user.displayName, leagueName: user.league.name, joinCode: user.league.joinCode, rank: placement.rank, trend: placement.trend } : null}
          isAdminLoggedIn={adminOk}
          allLeagues={allLeagues}
          weather={weather}
          needsSubmit={!!user && !user.submitted && !isLocked()}
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:py-10 sm:pb-10">{children}</main>
      </body>
    </html>
  );
}
