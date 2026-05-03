import { NextResponse } from "next/server";
import { findQuestion } from "@/lib/content/loader";
import { scoreAnswer } from "@/lib/content/schema";
import { recordAttempt, recordExamSession } from "@/lib/progress/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profileId?: string;
      answers?: Array<{
        questionId: string;
        selectedOptionId?: string | null;
      }>;
    };

    if (!body.profileId || !body.answers?.length) {
      return NextResponse.json({ error: "Faltan respuestas para cerrar el examen." }, { status: 400 });
    }

    const results = [];
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let score = 0;
    let maxScore = 0;
    let oppositionId = "";
    let topicId: string | null | undefined;

    for (const answer of body.answers) {
      const question = await findQuestion(answer.questionId);

      if (!question) {
        continue;
      }

      oppositionId ||= question.oppositionId;
      if (topicId === undefined) {
        topicId = question.topicId;
      } else if (topicId !== question.topicId) {
        topicId = null;
      }

      const result = scoreAnswer(
        question.scoring,
        answer.selectedOptionId ?? null,
        question.correctOptionId
      );

      if (!answer.selectedOptionId) {
        blank += 1;
      } else if (result.isCorrect) {
        correct += 1;
      } else {
        wrong += 1;
      }

      score += result.score;
      maxScore += question.scoring.correct;

      await recordAttempt({
        profileId: body.profileId,
        questionKey: question.questionKey,
        oppositionId: question.oppositionId,
        topicId: question.topicId,
        mode: "exam",
        selectedOptionId: answer.selectedOptionId ?? null,
        correctOptionId: question.correctOptionId,
        isCorrect: result.isCorrect,
        score: result.score
      });

      results.push({
        questionId: question.questionKey,
        selectedOptionId: answer.selectedOptionId ?? null,
        correctOptionId: question.correctOptionId,
        isCorrect: result.isCorrect,
        score: result.score,
        maxScore: question.scoring.correct,
        explanation: question.explanation
      });
    }

    if (oppositionId) {
      await recordExamSession({
        profileId: body.profileId,
        oppositionId,
        topicId: topicId ?? null,
        total: results.length,
        correct,
        wrong,
        blank,
        score
      });
    }

    return NextResponse.json({
      summary: {
        total: results.length,
        correct,
        wrong,
        blank,
        score,
        maxScore,
        grade: maxScore > 0 ? Math.max(0, Math.min(10, (score / maxScore) * 10)) : 0
      },
      results
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cerrar el examen." },
      { status: 500 }
    );
  }
}
