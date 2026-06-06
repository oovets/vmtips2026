import type { Metadata, Viewport } from "next";
import { Inter_Tight, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { getCurrentUser, getAllSessionUserIds, isAdminAuthed } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Nav } from "@/components/Nav";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

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

  return (
    <html lang="sv" className={`${inter.variable} ${sourceSans.variable}`}>
      <body className="min-h-screen font-sans">
        <Nav
          user={user ? { displayName: user.displayName, leagueName: user.league.name, joinCode: user.league.joinCode } : null}
          isAdminLoggedIn={adminOk}
          allLeagues={allLeagues}
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:py-10 sm:pb-10">{children}</main>
      </body>
    </html>
  );
}
