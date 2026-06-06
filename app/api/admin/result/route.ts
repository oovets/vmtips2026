import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recomputeAllScores } from "@/lib/scoring-service";
import { adminGuard } from "@/lib/admin-guard";

const schema = z.object({
  matchNumber: z.number().int().min(1).max(104),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  winnerTeamId: z.string().nullable().optional(),
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]).optional().default("FINISHED"),
});

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { matchNumber, homeScore, awayScore, status } = parsed.data;
  let { winnerTeamId } = parsed.data;

  const match = await prisma.match.findUnique({ where: { matchNumber } });
  if (!match) return NextResponse.json({ error: "Match saknas" }, { status: 404 });

  if (winnerTeamId === undefined || winnerTeamId === null) {
    if (homeScore > awayScore) winnerTeamId = match.homeTeamId;
    else if (awayScore > homeScore) winnerTeamId = match.awayTeamId;
    else winnerTeamId = null;
  }

  await prisma.match.update({
    where: { matchNumber },
    data: { homeScore, awayScore, winnerTeamId, status },
  });

  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, playersScored: scored });
}
