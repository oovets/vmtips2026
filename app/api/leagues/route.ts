import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, uniqueJoinCode } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

const schema = z.object({
  leagueName: z.string().trim().min(2).max(40),
  displayName: z.string().trim().min(2).max(24),
  pin: z.string().regex(/^\d{4}$/, "PIN måste vara 4 siffror"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { leagueName, displayName, pin } = parsed.data;

  const joinCode = await uniqueJoinCode();
  const league = await prisma.league.create({ data: { name: leagueName, joinCode } });
  const user = await prisma.user.create({
    data: {
      displayName,
      pinHash: hashPin(pin),
      isAdmin: true,
      leagueId: league.id,
    },
  });

  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true, joinCode, leagueName: league.name });
}
