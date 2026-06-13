import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { stockholmDayKey } from "@/lib/quiz-service";

// Allt QuizHome behöver: dagens status, dina dueller, motståndare och quiz-topplistan.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const dayKey = stockholmDayKey();

  const [finishedCount, daily, duels, members, results] = await Promise.all([
    prisma.match.count({ where: { stage: "GROUP", status: "FINISHED" } }),
    prisma.quiz.findUnique({
      where: { leagueId_kind_dayKey: { leagueId: user.leagueId, kind: "DAILY", dayKey } },
      include: { results: { select: { userId: true } } },
    }),
    prisma.quiz.findMany({
      where: { leagueId: user.leagueId, kind: "DUEL", OR: [{ createdById: user.id }, { opponentId: user.id }] },
      include: {
        results: true,
        createdBy: { select: { id: true, displayName: true } },
        opponent: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.user.findMany({
      where: { leagueId: user.leagueId, id: { not: user.id } },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.quizResult.findMany({
      where: { quiz: { leagueId: user.leagueId } },
      include: { user: { select: { id: true, displayName: true } } },
    }),
  ]);

  const duelRows = duels.map((d) => {
    const amCreator = d.createdById === user.id;
    const otherId = amCreator ? d.opponentId : d.createdById;
    const otherName = (amCreator ? d.opponent?.displayName : d.createdBy?.displayName) ?? "?";
    const myR = d.results.find((r) => r.userId === user.id);
    const otherR = d.results.find((r) => r.userId === otherId);
    const status = !myR ? "play" : !otherR ? "waiting" : "done";
    const outcome =
      status === "done" && myR && otherR
        ? myR.score > otherR.score
          ? "win"
          : myR.score < otherR.score
            ? "loss"
            : "tie"
        : null;
    return {
      quizId: d.id,
      otherName,
      myScore: myR?.score ?? null,
      otherScore: otherR?.score ?? null,
      status,
      outcome,
      otherAway: otherR?.awayCount ?? 0,
    };
  });

  const agg = new Map<
    string,
    { id: string; name: string; points: number; games: number; isMe: boolean; flagged: boolean }
  >();
  for (const r of results) {
    const cur =
      agg.get(r.userId) ??
      { id: r.userId, name: r.user.displayName, points: 0, games: 0, isMe: r.userId === user.id, flagged: false };
    cur.points += r.score;
    cur.games += 1;
    if (r.awayCount > 0) cur.flagged = true;
    agg.set(r.userId, cur);
  }
  const leaderboard = [...agg.values()].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );

  return NextResponse.json({
    canPlay: finishedCount >= 2,
    daily: {
      exists: !!daily,
      played: daily ? daily.results.some((r) => r.userId === user.id) : false,
      dayKey,
    },
    duels: duelRows,
    opponents: members,
    leaderboard,
  });
}
