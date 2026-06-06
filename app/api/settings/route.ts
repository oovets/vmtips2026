import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/auth";

const schema = z.object({
  displayName: z.string().min(2).max(24).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
});

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltig data" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.pin !== undefined) data.pinHash = hashPin(parsed.data.pin);

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true, displayName: updated.displayName });
}
