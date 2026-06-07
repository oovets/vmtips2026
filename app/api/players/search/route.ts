import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { searchPlayers } from "@/lib/player-stats-tournament";

export const dynamic = "force-dynamic";

// Sökträffar för spelar-dropdownen. Kräver inloggad användare (samma mönster som
// övriga rutter). Datakälla: de matchdetaljer vi redan sparar i Match.details.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchPlayers(q);
  return NextResponse.json({ results });
}
