import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;

  const league = await prisma.league.findUnique({ where: { id: params.id } });
  if (!league) return NextResponse.json({ error: "Liga hittades inte" }, { status: 404 });

  await prisma.league.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Ogiltigt namn" }, { status: 400 });
  }

  const league = await prisma.league.update({
    where: { id: params.id },
    data: { name: body.name.trim() },
  });
  return NextResponse.json({ ok: true, name: league.name });
}
