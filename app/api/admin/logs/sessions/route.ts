import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Frågeparametrar för sessionslistan. Allt valfritt — defaulta till nyaste 50.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  userId: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export async function GET(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ogiltig fråga" },
      { status: 400 },
    );
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const offset = parsed.data.offset ?? 0;
  const { userId, q } = parsed.data;

  // Filtrering: per användare och/eller fritext mot IP / stad / spelarnamn.
  const where: Prisma.SessionLogWhereInput = {};
  if (userId) where.userId = userId;
  if (q) {
    where.OR = [
      { ip: { contains: q, mode: "insensitive" } },
      { ipReverse: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { country: { contains: q, mode: "insensitive" } },
      { user: { is: { displayName: { contains: q, mode: "insensitive" } } } },
    ];
  }

  try {
    const sessions = await prisma.sessionLog.findMany({
      where,
      orderBy: { lastSeen: "desc" },
      skip: offset,
      take: limit + 1, // hämta en extra för att veta om det finns fler
      select: {
        sessionId: true,
        ip: true,
        ipReverse: true,
        country: true,
        countryCode: true,
        region: true,
        city: true,
        isp: true,
        org: true,
        userAgent: true,
        referrer: true,
        landingPath: true,
        firstSeen: true,
        lastSeen: true,
        user: { select: { displayName: true } },
        _count: { select: { events: true } },
      },
    });

    const hasMore = sessions.length > limit;
    const page = hasMore ? sessions.slice(0, limit) : sessions;

    return NextResponse.json({
      sessions: page.map((s) => ({
        sessionId: s.sessionId,
        displayName: s.user?.displayName ?? null,
        ip: s.ip,
        ipReverse: s.ipReverse,
        country: s.country,
        countryCode: s.countryCode,
        region: s.region,
        city: s.city,
        isp: s.isp,
        org: s.org,
        userAgent: s.userAgent,
        referrer: s.referrer,
        landingPath: s.landingPath,
        eventCount: s._count.events,
        firstSeen: s.firstSeen.toISOString(),
        lastSeen: s.lastSeen.toISOString(),
      })),
      hasMore,
      offset,
      limit,
    });
  } catch {
    // Tabellen finns kanske inte ännu (innan db:push) eller DB onåbar — svara
    // med tom lista istället för 500 så att UI degraderar elegant.
    return NextResponse.json({ sessions: [], hasMore: false, offset, limit });
  }
}
