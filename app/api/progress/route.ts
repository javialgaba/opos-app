import { NextResponse } from "next/server";
import { getProgress, getQuestionStats } from "@/lib/progress/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");

  if (!profileId) {
    return NextResponse.json({ error: "Falta profileId." }, { status: 400 });
  }

  try {
    const [progress, questionStats] = await Promise.all([
      getProgress(profileId),
      getQuestionStats(profileId)
    ]);

    return NextResponse.json({ progress, questionStats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el progreso." },
      { status: 500 }
    );
  }
}
