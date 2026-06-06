// Manuell resultatinmatning / override (skyddsnät när API:t inte räcker till).
// Skydd: header "x-admin-pin" måste matcha ADMIN_PIN.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recomputeAllScores } from "@/lib/scoring-service";
import { isAdminAuthed } from "@/lib/session";

const schema = z.object({
  matchNumber: z.number().int().min(1).max(104),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  winnerTeamId: z.string().nullable().optional(),
  status: z.enum(["SCHEDULED", "LIVE", "FINISHED"]).optional().default("FINISHED"),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthed()) && req.headers.get("x-admin-pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { matchNumber, homeScore, awayScore, status } = parsed.data;
  let { winnerTeamId } = parsed.data;

  const match = await prisma.match.findUnique({ where: { matchNumber } });
  if (!match) return NextResponse.json({ error: "Match saknas" }, { status: 404 });

  // Avgör vinnare automatiskt om resultatet inte är oavgjort
  if (winnerTeamId === undefined || winnerTeamId === null) {
    if (homeScore > awayScore) winnerTeamId = match.homeTeamId;
    else if (awayScore > homeScore) winnerTeamId = match.awayTeamId;
    else winnerTeamId = null; // oavgjort i grupp; slutspel kräver explicit vinnare (straffar)
  }

  await prisma.match.update({
    where: { matchNumber },
    data: { homeScore, awayScore, winnerTeamId, status },
  });

  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, playersScored: scored });
}
