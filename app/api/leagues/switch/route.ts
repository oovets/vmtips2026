import { NextResponse } from "next/server";
import { z } from "zod";
import { getAllSessionUserIds, setSessionCookie } from "@/lib/session";

const schema = z.object({ userId: z.string() });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig input" }, { status: 400 });

  const allIds = await getAllSessionUserIds();
  if (!allIds.includes(parsed.data.userId)) {
    return NextResponse.json({ error: "Ej tillåten" }, { status: 403 });
  }

  await setSessionCookie(parsed.data.userId, allIds);
  return NextResponse.json({ ok: true });
}
