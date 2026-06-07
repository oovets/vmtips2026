import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const deny = await adminGuard();
  if (deny) return deny;

  const entries = await prisma.guestbookEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      message: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
  });

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      userName: entry.user?.displayName ?? null,
      message: entry.message,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}
