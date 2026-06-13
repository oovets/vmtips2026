import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { gradeQuiz, type Question } from "@/lib/quiz";

const schema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      choiceIndex: z.number().int(),
      ms: z.number().int().min(0),
    }),
  ),
  // Anti-cheat-signaler från klienten (frivilliga)
  activity: z
    .object({
      awayCount: z.number().int().min(0).max(1000),
      awayMs: z.number().int().min(0),
    })
    .optional(),
});

// Rätta och spara ett resultat. Server-side rättning (klienten ser aldrig facit).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltiga svar" }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({ where: { id: params.id } });
  if (!quiz || quiz.leagueId !== user.leagueId)
    return NextResponse.json({ error: "Hittades inte" }, { status: 404 });
  if (quiz.kind === "DUEL" && quiz.createdById !== user.id && quiz.opponentId !== user.id)
    return NextResponse.json({ error: "Inte din duell" }, { status: 403 });

  const questions = quiz.questions as unknown as Question[];
  const { score, correctCount, totalMs } = gradeQuiz(questions, parsed.data.answers);

  try {
    await prisma.quizResult.create({
      data: {
        quizId: quiz.id,
        userId: user.id,
        score,
        correctCount,
        totalMs,
        awayCount: parsed.data.activity?.awayCount ?? 0,
        awayMs: parsed.data.activity?.awayMs ?? 0,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Du har redan spelat den här quizen" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, score, correctCount, totalQuestions: questions.length });
}
