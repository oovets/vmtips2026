import type { Metadata, Viewport } from "next";
import { Inter, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { Nav } from "@/components/Nav";

// Inter för rubriker, Source Sans 3 för läsbar brödtext.
const inter = Inter({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "VM-tips 2026 ⚽",
  description: "Tippa fotbolls-VM 2026 — matcher, grupper och slutspel. Följ ligan live.",
  appleWebApp: { capable: true, title: "VM-tips", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="sv" className={`${inter.variable} ${sourceSans.variable}`}>
      <body className="min-h-screen font-sans">
        <Nav
          user={
            user
              ? { displayName: user.displayName, isAdmin: user.isAdmin, leagueName: user.league.name }
              : null
          }
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:py-10 sm:pb-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-28 pt-6 text-center text-xs text-slate-500 sm:pb-10">
          VM-tips 2026 · data: openfootball + football-data.org · byggt med Next.js
        </footer>
      </body>
    </html>
  );
}
