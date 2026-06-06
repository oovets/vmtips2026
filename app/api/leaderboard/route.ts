import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Topplista för den inloggade spelarens liga (uppdateras via SWR-polling).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { leagueId: me.leagueId },
    include: { score: true },
  });

  const rows = users
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      submitted: u.submitted,
      total: u.score?.total ?? 0,
      breakdown: (u.score?.breakdown as Record<string, number> | null) ?? null,
      isMe: u.id === me.id,
    }))
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));

  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    if (prev === null || r.total !== prev) rank = i + 1;
    prev = r.total;
    return { ...r, rank };
  });

  return NextResponse.json({ leagueName: me.league.name, rows: ranked });
}
