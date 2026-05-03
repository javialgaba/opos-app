import { NextResponse } from "next/server";
import { findQuestion } from "@/lib/content/loader";
import { scoreAnswer } from "@/lib/content/schema";
import { recordAttempt, type StudyMode } from "@/lib/progress/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profileId?: string;
      questionId?: string;
      selectedOptionId?: string | null;
      mode?: StudyMode;
    };

    if (!body.profileId || !body.questionId) {
      return NextResponse.json({ error: "Faltan datos para corregir." }, { status: 400 });
    }

    const question = await findQuestion(body.questionId);

    if (!question) {
      return NextResponse.json({ error: "Pregunta no encontrada." }, { status: 404 });
    }

    const result = scoreAnswer(
      question.scoring,
      body.selectedOptionId ?? null,
      question.correctOptionId
    );

    await recordAttempt({
      profileId: body.profileId,
      questionKey: question.questionKey,
      oppositionId: question.oppositionId,
      topicId: question.topicId,
      mode: body.mode ?? "practice",
      selectedOptionId: body.selectedOptionId ?? null,
      correctOptionId: question.correctOptionId,
      isCorrect: result.isCorrect,
      score: result.score
    });

    return NextResponse.json({
      isCorrect: result.isCorrect,
      score: result.score,
      maxScore: question.scoring.correct,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo corregir." },
      { status: 500 }
    );
  }
}
