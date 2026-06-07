import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

const TOTAL_GROUP_MATCHES = 72;
const TOTAL_GROUPS = 12;
const TOTAL_BRACKET_PICKS = 31;
const THIRD_PLACE_MATCH = 103;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, displayName: true, submitted: true, league: { select: { tippingMode: true } } },
  });
  if (!user) return NextResponse.json({ error: "Spelare hittades inte" }, { status: 404 });
  if (user.submitted) return NextResponse.json({ ok: true, submitted: true });

  const [matchPreds, groupCount, bracketCount] = await Promise.all([
    prisma.matchPrediction.findMany({
      where: { userId: user.id, match: { matchNumber: { gte: 1, lte: TOTAL_GROUP_MATCHES } } },
      select: { predHome: true, predAway: true, predOutcome: true },
    }),
    prisma.groupPrediction.count({ where: { userId: user.id } }),
    prisma.bracketPrediction.count({
      where: { userId: user.id, winnerTeamId: { not: null }, matchNumber: { not: THIRD_PLACE_MATCH } },
    }),
  ]);

  const tippingMode = user.league.tippingMode as "EXACT" | "X12";
  const matchCount = matchPreds.filter((p) =>
    tippingMode === "X12" ? p.predOutcome != null : p.predHome != null && p.predAway != null,
  ).length;

  if (matchCount < TOTAL_GROUP_MATCHES) {
    return NextResponse.json(
      { error: `Spelaren saknar gruppmatchtips (${matchCount}/${TOTAL_GROUP_MATCHES}).` },
      { status: 400 },
    );
  }
  if (groupCount < TOTAL_GROUPS) {
    return NextResponse.json(
      { error: `Spelaren saknar grupprankningar (${groupCount}/${TOTAL_GROUPS}).` },
      { status: 400 },
    );
  }
  if (bracketCount < TOTAL_BRACKET_PICKS) {
    return NextResponse.json(
      { error: `Spelaren saknar slutspelsval (${bracketCount}/${TOTAL_BRACKET_PICKS}).` },
      { status: 400 },
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { submitted: true } });
  return NextResponse.json({ ok: true, submitted: true });
}
