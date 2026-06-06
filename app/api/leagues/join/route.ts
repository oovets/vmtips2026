import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

const schema = z.object({
  joinCode: z.string().trim().min(4).max(10),
  displayName: z.string().trim().min(2).max(24),
  pin: z.string().regex(/^\d{4}$/, "PIN måste vara 4 siffror"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { joinCode, displayName, pin } = parsed.data;

  const league = await prisma.league.findUnique({
    where: { joinCode: joinCode.toUpperCase() },
  });
  if (!league) return NextResponse.json({ error: "Ligan finns inte" }, { status: 404 });

  const existing = await prisma.user.findUnique({
    where: { leagueId_displayName: { leagueId: league.id, displayName } },
  });

  let userId: string;
  if (existing) {
    // Befintligt namn -> logga in med rätt PIN
    if (!verifyPin(pin, existing.pinHash)) {
      return NextResponse.json({ error: "Fel PIN för det namnet" }, { status: 401 });
    }
    userId = existing.id;
  } else {
    const user = await prisma.user.create({
      data: { displayName, pinHash: hashPin(pin), leagueId: league.id },
    });
    userId = user.id;
  }

  await setSessionCookie(userId);
  return NextResponse.json({ ok: true, leagueName: league.name });
}
