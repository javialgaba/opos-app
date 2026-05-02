import { NextResponse } from "next/server";
import { loadPublicQuestions } from "@/lib/content/loader";
import { getQuestionStats } from "@/lib/progress/store";

function priorityForQuestion(questionId: string, stats: Awaited<ReturnType<typeof getQuestionStats>>) {
  const questionStats = stats[questionId];

  if (!questionStats) {
    return 0.2 + Math.random() * 0.25;
  }

  const accuracy = questionStats.correct / questionStats.attempts;
  const attemptPenalty = Math.min(questionStats.attempts, 8) / 20;
  const age =
    (Date.now() - new Date(questionStats.lastAttemptAt).getTime()) / (1000 * 60 * 60 * 24);
  const ageBoost = Math.min(age / 30, 0.35);

  return accuracy + attemptPenalty - ageBoost + Math.random() * 0.1;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const oppositionId = url.searchParams.get("oppositionId");
  const topicId = url.searchParams.get("topicId");
  const limit = Number(url.searchParams.get("limit") ?? "20");

  try {
    const questions = await loadPublicQuestions();
    const stats = profileId ? await getQuestionStats(profileId) : {};
    const filtered = questions
      .filter((question) => !oppositionId || question.oppositionId === oppositionId)
      .filter((question) => !topicId || question.topicId === topicId)
      .sort((a, b) => priorityForQuestion(a.id, stats) - priorityForQuestion(b.id, stats))
      .slice(0, Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20);

    return NextResponse.json({ questions: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo preparar la cola." },
      { status: 500 }
    );
  }
}
