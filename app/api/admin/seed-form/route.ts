import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { STATIC_FORM } from "@/lib/team-form";

export async function POST() {
  const deny = await adminGuard();
  if (deny) return deny;

  const teams = await prisma.team.findMany({ select: { id: true, code: true } });
  let updated = 0;

  for (const team of teams) {
    const form = STATIC_FORM[team.code];
    if (!form) continue;
    await prisma.team.update({
      where: { id: team.id },
      data: { recentForm: form as object[] },
    });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
