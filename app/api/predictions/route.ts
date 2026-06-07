import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/lock";

const exactPred = z.object({
  matchNumber: z.number().int(),
  predHome: z.number().int().min(0).max(99),
  predAway: z.number().int().min(0).max(99),
});

const x12Pred = z.object({
  matchNumber: z.number().int(),
  predOutcome: z.enum(["1", "X", "2"]),
});

const schema = z.object({
  submit: z.boolean().optional().default(false),
  // Frivilligt skyttekung-tips. null/tom sträng = inget tips. Inte ett krav för inlämning.
  topScorerPlayer: z.string().trim().max(80).nullable().optional(),
  topScorerTeamId: z.string().nullable().optional(),
  matchPreds: z.array(z.union([exactPred, x12Pred])).default([]),
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
    tippingMode: user.league.tippingMode,
    topScorerPlayer: user.topScorerPlayer,
    topScorerTeamId: user.topScorerTeamId,
    matchPreds: matchPreds.map((p) => ({
      matchNumber: p.match.matchNumber,
      predHome: p.predHome,
      predAway: p.predAway,
      predOutcome: p.predOutcome,
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
  const { submit, matchPreds, groupPreds, bracketPreds, topScorerPlayer, topScorerTeamId } = parsed.data;

  // Tomt skyttekung-namn lagras som null (inget tips). Lag-id behålls bara om namn finns.
  const cleanScorer = topScorerPlayer && topScorerPlayer.trim().length > 0 ? topScorerPlayer.trim() : null;
  const cleanScorerTeam = cleanScorer ? (topScorerTeamId ?? null) : null;

  // Vid inlämning: kräv komplett tips (alla 72 gruppmatcher, 12 grupprankningar och
  // hela slutspelsträdet). Bronsmatchen (#103) räknas inte — den går inte att tippa
  // och ger inga poäng. Utkast får sparas ofullständiga.
  if (submit) {
    const groupMatchCount = matchPreds.filter((p) => p.matchNumber >= 1 && p.matchNumber <= 72).length;
    const bracketWinnerCount = bracketPreds.filter((b) => b.winnerTeamId && b.matchNumber !== 103).length;
    if (groupMatchCount < 72) {
      return NextResponse.json(
        { error: `Fyll i alla gruppmatcher innan inlämning (${groupMatchCount}/72).` },
        { status: 400 },
      );
    }
    if (groupPreds.length < 12) {
      return NextResponse.json(
        { error: "Alla grupper måste vara färdigtippade innan inlämning." },
        { status: 400 },
      );
    }
    if (bracketWinnerCount < 31) {
      return NextResponse.json(
        { error: `Slutför slutspelsträdet innan inlämning (${bracketWinnerCount}/31).` },
        { status: 400 },
      );
    }
  }

  const matches = await prisma.match.findMany({ select: { id: true, matchNumber: true } });
  const idByNumber = new Map(matches.map((m) => [m.matchNumber, m.id]));

  // Validera ev. lag-id mot riktiga lag (annars spara null).
  let validScorerTeam: string | null = null;
  if (cleanScorerTeam) {
    const team = await prisma.team.findUnique({ where: { id: cleanScorerTeam }, select: { id: true } });
    validScorerTeam = team?.id ?? null;
  }

  await prisma.$transaction([
    prisma.matchPrediction.deleteMany({ where: { userId: user.id } }),
    prisma.matchPrediction.createMany({
      data: matchPreds
        .filter((p) => idByNumber.has(p.matchNumber))
        .map((p) => {
          if ("predOutcome" in p) {
            return { userId: user.id, matchId: idByNumber.get(p.matchNumber)!, predHome: null, predAway: null, predOutcome: p.predOutcome };
          }
          return { userId: user.id, matchId: idByNumber.get(p.matchNumber)!, predHome: p.predHome, predAway: p.predAway, predOutcome: null };
        }),
    }),
    prisma.groupPrediction.deleteMany({ where: { userId: user.id } }),
    prisma.groupPrediction.createMany({ data: groupPreds.map((g) => ({ userId: user.id, ...g })) }),
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
      data: {
        submitted: submit ? true : user.submitted,
        topScorerPlayer: cleanScorer,
        topScorerTeamId: validScorerTeam,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, submitted: submit ? true : user.submitted });
}
