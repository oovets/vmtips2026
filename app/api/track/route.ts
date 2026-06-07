// Ingest-API för användarsessions-loggning. Tar emot batchade klienthändelser,
// resolver userId server-side (litar ALDRIG på klientskickat userId), berikar
// IP med reverse-DNS + GeoIP vid första sikten av en session och persisterar
// händelserna. Måste vara robust och icke-blockerande: returnerar snabbt 204 och
// kastar aldrig fel till klienten — även om berikning eller skrivning misslyckas.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getRequestIp } from "@/lib/request-ip";
import { enrichIp } from "@/lib/geoip";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 50;
const TEXT_MAX = 200;
const STR_MAX = 512;

const str = (max: number) => z.string().trim().max(max).optional().nullable();

const eventSchema = z.object({
  type: z.enum(["PAGEVIEW", "CLICK", "INPUT_FOCUS", "SUBMIT", "NAV"]),
  path: str(STR_MAX),
  targetTag: str(64),
  targetText: str(TEXT_MAX),
  targetId: str(STR_MAX),
  selector: str(STR_MAX),
  elementLabel: str(TEXT_MAX),
  x: z.number().int().optional().nullable(),
  y: z.number().int().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  // Klient-tidsstämpel (ms). Endast informativ — vi använder serverns createdAt.
  ts: z.number().optional().nullable(),
});

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  referrer: str(STR_MAX),
  landingPath: str(STR_MAX),
  events: z.array(eventSchema).max(MAX_EVENTS).default([]),
});

function noContent() {
  return new Response(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);

    // Lättviktig rate-limit per IP (eller "unknown") — skyddar mot missbruk men
    // är generös eftersom batchar flushas relativt sällan.
    if (!rateLimit(`track:${ip ?? "unknown"}`, 120, 60_000)) {
      return noContent();
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      // Ogiltig payload: svälj tyst, bryt aldrig klienten.
      return noContent();
    }
    const { sessionId, referrer, landingPath, events } = parsed.data;

    // userId resolveras ALLTID server-side ur sessionscookien.
    const user = await getCurrentUser().catch(() => null);
    const userId = user?.id ?? null;

    const userAgent = req.headers.get("user-agent")?.slice(0, STR_MAX) ?? null;

    // Finns sessionen redan? Avgör om vi behöver berika IP (endast vid första sikten).
    const existing = await prisma.sessionLog
      .findUnique({ where: { sessionId }, select: { id: true } })
      .catch(() => null);

    if (!existing) {
      // Första sikten: berika IP (defensivt — fel ger null, aldrig kast).
      let ipReverse: string | null = null;
      let geo = {
        country: null as string | null,
        countryCode: null as string | null,
        region: null as string | null,
        city: null as string | null,
        lat: null as number | null,
        lon: null as number | null,
        isp: null as string | null,
        org: null as string | null,
        asn: null as string | null,
      };
      if (ip) {
        try {
          const enriched = await enrichIp(ip);
          ipReverse = enriched.ipReverse;
          geo = enriched.geo;
        } catch {
          // Behåll null-värden — registrera händelserna ändå.
        }
      }

      await prisma.sessionLog
        .create({
          data: {
            sessionId,
            userId,
            ip,
            ipReverse,
            country: geo.country,
            countryCode: geo.countryCode,
            region: geo.region,
            city: geo.city,
            lat: geo.lat,
            lon: geo.lon,
            isp: geo.isp,
            org: geo.org,
            asn: geo.asn,
            userAgent,
            referrer: referrer ?? null,
            landingPath: landingPath ?? null,
          },
        })
        // Kapplöpning: en parallell batch kan ha skapat raden. Ignorera då tyst.
        .catch(() => null);
    } else {
      // Senare sikt: uppdatera lastSeen (via @updatedAt) och koppla userId om
      // besökaren loggat in sedan sessionen skapades.
      await prisma.sessionLog
        .update({
          where: { sessionId },
          data: { lastSeen: new Date(), ...(userId ? { userId } : {}) },
        })
        .catch(() => null);
    }

    if (events.length > 0) {
      await prisma.interactionEvent
        .createMany({
          data: events.map((e) => ({
            sessionId,
            userId,
            type: e.type,
            path: e.path ?? null,
            targetTag: e.targetTag ?? null,
            targetText: e.targetText ?? null,
            targetId: e.targetId ?? null,
            selector: e.selector ?? null,
            elementLabel: e.elementLabel ?? null,
            x: e.x ?? null,
            y: e.y ?? null,
            metadata: e.metadata
              ? (e.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          })),
        })
        .catch(() => null);
    }

    return noContent();
  } catch {
    // Sista skyddsnät: aldrig 500 till klienten.
    return noContent();
  }
}
