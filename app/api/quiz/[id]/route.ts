import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { stripAnswers, QUIZ, type Question } from "@/lib/quiz";

// Hämta en quiz: frågor utan facit om man inte spelat, annars resultat + jämförelse.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: {
      results: { include: { user: { select: { id: true, displayName: true } } } },
      createdBy: { select: { id: true, displayName: true } },
      opponent: { select: { id: true, displayName: true } },
    },
  });
  if (!quiz || quiz.leagueId !== user.leagueId)
    return NextResponse.json({ error: "Hittades inte" }, { status: 404 });

  if (quiz.kind === "DUEL" && quiz.createdById !== user.id && quiz.opponentId !== user.id)
    return NextResponse.json({ error: "Inte din duell" }, { status: 403 });

  const questions = quiz.questions as unknown as Question[];
  const myResult = quiz.results.find((r) => r.userId === user.id);

  if (!myResult) {
    return NextResponse.json({
      kind: quiz.kind,
      played: false,
      perQuestionMs: QUIZ.perQuestionMs,
      questions: stripAnswers(questions),
    });
  }

  return NextResponse.json({
    kind: quiz.kind,
    played: true,
    totalQuestions: questions.length,
    myResult: { score: myResult.score, correctCount: myResult.correctCount, awayCount: myResult.awayCount },
    others: quiz.results
      .filter((r) => r.userId !== user.id)
      .map((r) => ({
        name: r.user.displayName,
        score: r.score,
        correctCount: r.correctCount,
        awayCount: r.awayCount,
      })),
  });
}
