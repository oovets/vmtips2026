import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Spelare hittades inte" }, { status: 404 });

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  displayName: z.string().min(2).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
  isAdmin: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ogiltig data" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Spelare hittades inte" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.pin !== undefined) data.pinHash = hashPin(parsed.data.pin);
  if (parsed.data.isAdmin !== undefined) data.isAdmin = parsed.data.isAdmin;

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, displayName: updated.displayName, isAdmin: updated.isAdmin });
}
