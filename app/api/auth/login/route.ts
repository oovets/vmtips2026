import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/auth";
import { setSessionCookie, getAllSessionUserIds } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  displayName: z.string().trim().max(24).optional(),
  pin: z.string().regex(/^\d{4}$/, "PIN måste vara 4 siffror"),
  // Optional: which userId to pick when multiple leagues match
  userId: z.string().optional(),
});

export async function POST(req: Request) {
  // PIN är bara 4 siffror (10 000 kombinationer) — strypa gissningar hårt.
  if (!rateLimit(`login:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "För många försök — vänta en minut och försök igen." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { displayName, pin, userId: pickId } = parsed.data;

  // If a specific userId was chosen (from multi-league picker), verify and log in
  if (pickId) {
    const user = await prisma.user.findUnique({ where: { id: pickId }, include: { league: true } });
    if (!user || !verifyPin(pin, user.pinHash)) {
      return NextResponse.json({ error: "Fel PIN" }, { status: 401 });
    }
    const existing = await getAllSessionUserIds();
    const allIds = Array.from(new Set([...existing, user.id]));
    await setSessionCookie(user.id, allIds);
    return NextResponse.json({ ok: true, leagueName: user.league.name });
  }

  // Inget userId valt → kräv giltigt namn för namnsökningen nedan.
  if (!displayName || displayName.length < 2) {
    return NextResponse.json({ error: "Ange ditt namn (minst 2 tecken)" }, { status: 400 });
  }

  // Find all users with matching name
  const candidates = await prisma.user.findMany({
    where: { displayName: { equals: displayName, mode: "insensitive" } },
    include: { league: true },
  });

  const matches = candidates.filter((u) => verifyPin(pin, u.pinHash));

  if (matches.length === 0) {
    return NextResponse.json({ error: "Ingen spelare hittades med det namnet och PIN-koden" }, { status: 401 });
  }

  if (matches.length === 1) {
    const existing = await getAllSessionUserIds();
    const allIds = Array.from(new Set([...existing, matches[0].id]));
    await setSessionCookie(matches[0].id, allIds);
    return NextResponse.json({ ok: true, leagueName: matches[0].league.name });
  }

  // Multiple matches → return choices for user to pick from
  return NextResponse.json({
    choices: matches.map((u) => ({ userId: u.id, leagueName: u.league.name, displayName: u.displayName })),
  });
}
