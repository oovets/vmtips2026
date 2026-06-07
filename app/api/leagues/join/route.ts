import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin, uniqueLoginCode } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  joinCode: z.string().trim().min(4).max(10),
  displayName: z.string().trim().min(2).max(24),
  pin: z.string().regex(/^\d{4}$/, "PIN måste vara 4 siffror"),
});

export async function POST(req: Request) {
  // Skydda mot gissning av både liga-koder och befintliga spelares PIN.
  if (!rateLimit(`join:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "För många försök — vänta en minut och försök igen." }, { status: 429 });
  }

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
  let loginCode: string;

  if (existing) {
    if (!verifyPin(pin, existing.pinHash)) {
      return NextResponse.json({ error: "Fel PIN för det namnet" }, { status: 401 });
    }
    userId = existing.id;
    loginCode = existing.loginCode;
  } else {
    loginCode = await uniqueLoginCode();
    const user = await prisma.user.create({
      data: { displayName, pinHash: hashPin(pin), loginCode, leagueId: league.id },
    });
    userId = user.id;
  }

  await setSessionCookie(userId);
  return NextResponse.json({ ok: true, loginCode, leagueName: league.name });
}
