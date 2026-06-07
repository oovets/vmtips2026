import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recomputeAllScores } from "@/lib/scoring-service";
import { adminGuard } from "@/lib/admin-guard";

// Sätter facit för VM:s skyttekung (frivilligt tips). Tomt namn rensar facit.
const schema = z.object({
  player: z.string().trim().max(80).nullable().optional(),
  teamId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }

  const player = parsed.data.player && parsed.data.player.trim().length > 0 ? parsed.data.player.trim() : null;
  let teamId: string | null = null;
  if (player && parsed.data.teamId) {
    const team = await prisma.team.findUnique({ where: { id: parsed.data.teamId }, select: { id: true } });
    teamId = team?.id ?? null;
  }

  await prisma.tournamentFact.upsert({
    where: { key: "topScorer" },
    update: { value: player, teamId },
    create: { key: "topScorer", value: player, teamId },
  });

  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, player, playersScored: scored });
}
