import { StudyApp } from "@/components/study-app";
import { loadPublicQuestions } from "@/lib/content/loader";

export default async function Home() {
  const questions = await loadPublicQuestions();

  return <StudyApp initialQuestions={questions} />;
}
