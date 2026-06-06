import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/lock";

const schema = z.object({
  submit: z.boolean().optional().default(false),
  matchPreds: z
    .array(
      z.object({
        matchNumber: z.number().int(),
        predHome: z.number().int().min(0).max(99),
        predAway: z.number().int().min(0).max(99),
      }),
    )
    .default([]),
  groupPreds: z
    .array(
      z.object({
        groupId: z.string().length(1),
        rank1TeamId: z.string(),
        rank2TeamId: z.string(),
        rank3TeamId: z.string(),
        rank4TeamId: z.string(),
      }),
    )
    .default([]),
  bracketPreds: z
    .array(
      z.object({
        matchNumber: z.number().int().min(73).max(104),
        team1Id: z.string().nullable().optional(),
        team2Id: z.string().nullable().optional(),
        winnerTeamId: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const [matchPreds, groupPreds, bracketPreds] = await Promise.all([
    prisma.matchPrediction.findMany({
      where: { userId: user.id },
      include: { match: { select: { matchNumber: true } } },
    }),
    prisma.groupPrediction.findMany({ where: { userId: user.id } }),
    prisma.bracketPrediction.findMany({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    submitted: user.submitted,
    locked: isLocked(),
    matchPreds: matchPreds.map((p) => ({
      matchNumber: p.match.matchNumber,
      predHome: p.predHome,
      predAway: p.predAway,
    })),
    groupPreds,
    bracketPreds,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  if (isLocked()) {
    return NextResponse.json({ error: "Tipsen är låsta — turneringen har börjat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ogiltig input" }, { status: 400 });
  }
  const { submit, matchPreds, groupPreds, bracketPreds } = parsed.data;

  // matchNumber -> matchId (endast gruppmatcher tippas på resultat)
  const matches = await prisma.match.findMany({ select: { id: true, matchNumber: true } });
  const idByNumber = new Map(matches.map((m) => [m.matchNumber, m.id]));

  await prisma.$transaction([
    prisma.matchPrediction.deleteMany({ where: { userId: user.id } }),
    prisma.matchPrediction.createMany({
      data: matchPreds
        .filter((p) => idByNumber.has(p.matchNumber))
        .map((p) => ({
          userId: user.id,
          matchId: idByNumber.get(p.matchNumber)!,
          predHome: p.predHome,
          predAway: p.predAway,
        })),
    }),
    prisma.groupPrediction.deleteMany({ where: { userId: user.id } }),
    prisma.groupPrediction.createMany({
      data: groupPreds.map((g) => ({ userId: user.id, ...g })),
    }),
    prisma.bracketPrediction.deleteMany({ where: { userId: user.id } }),
    prisma.bracketPrediction.createMany({
      data: bracketPreds.map((b) => ({
        userId: user.id,
        matchNumber: b.matchNumber,
        team1Id: b.team1Id ?? null,
        team2Id: b.team2Id ?? null,
        winnerTeamId: b.winnerTeamId ?? null,
      })),
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { submitted: submit ? true : user.submitted },
    }),
  ]);

  return NextResponse.json({ ok: true, submitted: submit ? true : user.submitted });
}
