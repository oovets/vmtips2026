import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const TOP_N = 5;

// Aggregerad översikt för loggfliken: totaler + topp-sidor/länder. Allt via
// count/groupBy så vi aldrig laddar alla rader.
export async function GET() {
  const deny = await adminGuard();
  if (deny) return deny;

  try {
    const [totalSessions, totalEvents, ipGroups, topPaths, topCountries] = await Promise.all([
      prisma.sessionLog.count(),
      prisma.interactionEvent.count(),
      prisma.sessionLog.groupBy({
        by: ["ip"],
        where: { ip: { not: null } },
        _count: { _all: true },
      }),
      prisma.interactionEvent.groupBy({
        by: ["path"],
        where: { path: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: TOP_N,
      }),
      prisma.sessionLog.groupBy({
        by: ["country", "countryCode"],
        where: { country: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { country: "desc" } },
        take: TOP_N,
      }),
    ]);

    return NextResponse.json({
      totalSessions,
      totalEvents,
      uniqueIps: ipGroups.length,
      topPaths: topPaths
        .filter((p) => p.path)
        .map((p) => ({ path: p.path as string, count: p._count._all })),
      topCountries: topCountries
        .filter((c) => c.country)
        .map((c) => ({
          country: c.country as string,
          countryCode: c.countryCode ?? null,
          count: c._count._all,
        })),
    });
  } catch {
    // Innan db:push eller om DB onåbar: tomma totaler, aldrig 500.
    return NextResponse.json({
      totalSessions: 0,
      totalEvents: 0,
      uniqueIps: 0,
      topPaths: [],
      topCountries: [],
    });
  }
}
