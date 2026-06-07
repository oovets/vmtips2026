import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const querySchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId krävs"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export async function GET(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    order: url.searchParams.get("order") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ogiltig fråga" },
      { status: 400 },
    );
  }

  const { sessionId } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const order = parsed.data.order ?? "asc";

  try {
    const events = await prisma.interactionEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: order },
      take: limit,
      select: {
        id: true,
        type: true,
        path: true,
        targetTag: true,
        targetText: true,
        elementLabel: true,
        selector: true,
        metadata: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        path: e.path,
        targetTag: e.targetTag,
        targetText: e.targetText,
        elementLabel: e.elementLabel,
        selector: e.selector,
        metadata: e.metadata ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch {
    // Innan db:push eller om DB onåbar: svara med tom lista, aldrig 500.
    return NextResponse.json({ events: [] });
  }
}
