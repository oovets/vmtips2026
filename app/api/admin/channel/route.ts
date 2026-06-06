import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/admin-guard";

const schema = z.object({
  matchNumber: z.number().int().min(1).max(104),
  // Tom sträng = nollställ kanalen.
  channel: z.string().trim().max(40),
});

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { matchNumber, channel } = parsed.data;

  const match = await prisma.match.findUnique({ where: { matchNumber } });
  if (!match) return NextResponse.json({ error: "Match saknas" }, { status: 404 });

  await prisma.match.update({
    where: { matchNumber },
    data: { channel: channel === "" ? null : channel },
  });

  return NextResponse.json({ ok: true });
}
