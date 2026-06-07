import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { playerTournamentStats } from "@/lib/player-stats-tournament";

export const dynamic = "force-dynamic";

// Full spelarstatistik hittills i turneringen. Kräver inloggad användare.
// Datakälla: de matchdetaljer vi redan sparar i Match.details (mål/kort).
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const name = decodeURIComponent(params.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Spelarnamn saknas" }, { status: 400 });

  const stats = await playerTournamentStats(name);
  if (!stats) return NextResponse.json({ error: "Hittades inte" }, { status: 404 });

  return NextResponse.json(stats);
}
