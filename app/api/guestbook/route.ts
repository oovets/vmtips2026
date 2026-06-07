import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 280;

const schema = z.object({
  message: z.string().trim().min(1, "Skriv något först").max(MAX_MESSAGE, `Max ${MAX_MESSAGE} tecken`),
});

// Senaste meddelandena på klotterplanket (nyast först).
export async function GET() {
  const entries = await prisma.guestbookEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, message: true, createdAt: true },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      name: e.name,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

// Skriv ett nytt meddelande. Endast inloggade spelare får skriva och attribueras
// alltid till sitt eget spelarnamn.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Du måste vara inloggad för att skriva på klotterplanket." },
      { status: 401 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }

  const message = parsed.data.message.trim();
  if (!message) {
    return NextResponse.json({ error: "Skriv något först" }, { status: 400 });
  }

  const entry = await prisma.guestbookEntry.create({
    data: {
      name: user.displayName,
      message,
      userId: user.id,
    },
    select: { id: true, name: true, message: true, createdAt: true },
  });

  return NextResponse.json({
    entry: {
      id: entry.id,
      name: entry.name,
      message: entry.message,
      createdAt: entry.createdAt.toISOString(),
    },
  });
}
