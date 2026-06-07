import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const deny = await adminGuard();
  if (deny) return deny;

  const existing = await prisma.guestbookEntry.findUnique({
    where: { id: params.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Inlägget finns inte." }, { status: 404 });
  }

  await prisma.guestbookEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
