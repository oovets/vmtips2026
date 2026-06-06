import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin, uniqueJoinCode, uniqueLoginCode } from "@/lib/auth";
import { getCurrentUser, getAllSessionUserIds, setSessionCookie } from "@/lib/session";

const schema = z.union([
  z.object({
    action: z.literal("join"),
    joinCode: z.string().trim().min(4).max(10),
    displayName: z.string().trim().min(2).max(24),
    pin: z.string().regex(/^\d{4}$/),
  }),
  z.object({
    action: z.literal("create"),
    leagueName: z.string().trim().min(2).max(40),
    displayName: z.string().trim().min(2).max(24),
    pin: z.string().regex(/^\d{4}$/),
    tippingMode: z.enum(["EXACT", "X12"]).default("EXACT"),
  }),
]);

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig input" }, { status: 400 });

  const data = parsed.data;
  let newUserId: string;
  let leagueName: string;
  let joinCode: string | undefined;

  if (data.action === "join") {
    const league = await prisma.league.findUnique({ where: { joinCode: data.joinCode.toUpperCase() } });
    if (!league) return NextResponse.json({ error: "Ligan finns inte" }, { status: 404 });

    const existing = await prisma.user.findUnique({
      where: { leagueId_displayName: { leagueId: league.id, displayName: data.displayName } },
    });

    if (existing) {
      if (!verifyPin(data.pin, existing.pinHash))
        return NextResponse.json({ error: "Fel PIN för det namnet" }, { status: 401 });
      newUserId = existing.id;
    } else {
      const loginCode = await uniqueLoginCode();
      const user = await prisma.user.create({
        data: { displayName: data.displayName, pinHash: hashPin(data.pin), loginCode, leagueId: league.id },
      });
      newUserId = user.id;
    }
    leagueName = league.name;
  } else {
    joinCode = await uniqueJoinCode();
    const loginCode = await uniqueLoginCode();
    const league = await prisma.league.create({
      data: { name: data.leagueName, joinCode, tippingMode: data.tippingMode },
    });
    const user = await prisma.user.create({
      data: { displayName: data.displayName, pinHash: hashPin(data.pin), loginCode, leagueId: league.id },
    });
    newUserId = user.id;
    leagueName = league.name;
  }

  const existing = await getAllSessionUserIds();
  const allIds = Array.from(new Set([...existing, newUserId]));
  // Stay in current league after adding — switch manually via league switcher
  await setSessionCookie(me.id, allIds);
  return NextResponse.json({ ok: true, leagueName, joinCode });
}
