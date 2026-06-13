import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateQuestions } from "@/lib/quiz-service";

const schema = z.object({ opponentId: z.string().min(1) });

// Skapa en duell mot en namngiven motståndare i samma liga.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Välj motståndare" }, { status: 400 });
  const { opponentId } = parsed.data;

  if (opponentId === user.id)
    return NextResponse.json({ error: "Du kan inte utmana dig själv" }, { status: 400 });
  const opponent = await prisma.user.findFirst({
    where: { id: opponentId, leagueId: user.leagueId },
    select: { id: true },
  });
  if (!opponent) return NextResponse.json({ error: "Motståndaren finns inte i ligan" }, { status: 404 });

  const questions = await generateQuestions();
  if (!questions) return NextResponse.json({ error: "För få matcher spelade för quiz än" }, { status: 400 });

  const quiz = await prisma.quiz.create({
    data: {
      leagueId: user.leagueId,
      kind: "DUEL",
      seed: "duel",
      questions: questions as unknown as Prisma.InputJsonValue,
      createdById: user.id,
      opponentId,
    },
  });

  return NextResponse.json({ ok: true, quizId: quiz.id });
}
