import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateQuestions, stockholmDayKey } from "@/lib/quiz-service";

// Säkerställ dagens quiz för ligan (en per liga och dag) och returnera dess id.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const dayKey = stockholmDayKey();
  const where = {
    leagueId_kind_dayKey: { leagueId: user.leagueId, kind: "DAILY" as const, dayKey },
  };

  const existing = await prisma.quiz.findUnique({ where });
  if (existing) return NextResponse.json({ ok: true, quizId: existing.id });

  const questions = await generateQuestions();
  if (!questions) return NextResponse.json({ error: "För få matcher spelade för quiz än" }, { status: 400 });

  try {
    const quiz = await prisma.quiz.create({
      data: {
        leagueId: user.leagueId,
        kind: "DAILY",
        seed: dayKey,
        dayKey,
        questions: questions as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    return NextResponse.json({ ok: true, quizId: quiz.id });
  } catch (e) {
    // Race: någon annan i ligan skapade samtidigt — läs om.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.quiz.findUnique({ where });
      if (again) return NextResponse.json({ ok: true, quizId: again.id });
    }
    throw e;
  }
}
