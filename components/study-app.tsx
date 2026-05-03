"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ClipboardList,
  Loader2,
  RotateCcw,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PublicQuestion } from "@/lib/content/schema";

type Profile = {
  id: string;
  alias: string;
};

type Tab = "practice" | "exam" | "progress";

type AnswerResult = {
  isCorrect: boolean;
  score: number;
  maxScore: number;
  correctOptionId: string;
  explanation: string;
};

type RoundAnswer = AnswerResult & {
  questionId: string;
  selectedOptionId: string;
};

type RoundSummary = {
  total: number;
  correct: number;
  wrong: number;
  score: number;
  maxScore: number;
  grade: number;
  results: RoundAnswer[];
};

type ExamResult = {
  summary: {
    total: number;
    correct: number;
    wrong: number;
    blank: number;
    score: number;
    maxScore: number;
    grade: number;
  };
  results: Array<AnswerResult & { questionId: string; selectedOptionId: string | null }>;
};

type ProgressPayload = {
  progress: {
    totalAttempts: number;
    byOpposition: Array<{
      oppositionId: string;
      attempts: number;
      correct: number;
      score: number;
    }>;
    byTopic: Array<{
      oppositionId: string;
      topicId: string;
      attempts: number;
      correct: number;
      score: number;
    }>;
  };
};

const PROFILE_STORAGE_KEY = "opos.profile";
const PRACTICE_ROUND_SIZE = 20;
const EXAM_QUESTION_COUNT = 100;

function getAccuracy(correct: number, attempts: number) {
  if (!attempts) {
    return 0;
  }

  return Math.round((correct / attempts) * 100);
}

function getQuestionLabel(question: PublicQuestion | undefined) {
  if (!question) {
    return "";
  }

  return `${question.oppositionName} · ${question.topicName}`;
}

function getGrade(score: number, maxScore: number) {
  if (maxScore <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(10, (score / maxScore) * 10));
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "La petición ha fallado.");
  }

  return payload as T;
}

export function StudyApp({ initialQuestions }: { initialQuestions: PublicQuestion[] }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [alias, setAlias] = useState("");
  const [tab, setTab] = useState<Tab>("practice");
  const [oppositionId, setOppositionId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [queue, setQueue] = useState<PublicQuestion[]>(
    initialQuestions.slice(0, PRACTICE_ROUND_SIZE)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, RoundAnswer>>({});
  const [practiceRoundFinished, setPracticeRoundFinished] = useState(false);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const currentQuestion = queue[currentIndex];
  const queueLimit = tab === "exam" ? EXAM_QUESTION_COUNT : PRACTICE_ROUND_SIZE;

  const oppositions = useMemo(() => {
    const map = new Map<string, string>();
    initialQuestions.forEach((question) => map.set(question.oppositionId, question.oppositionName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
  }, [initialQuestions]);

  const topics = useMemo(() => {
    const map = new Map<string, string>();
    initialQuestions
      .filter((question) => !oppositionId || question.oppositionId === oppositionId)
      .forEach((question) => map.set(question.topicId, question.topicName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
  }, [initialQuestions, oppositionId]);

  const topicNames = useMemo(() => {
    const map = new Map<string, string>();
    initialQuestions.forEach((question) => map.set(question.topicId, question.topicName));
    return map;
  }, [initialQuestions]);

  const oppositionNames = useMemo(() => {
    const map = new Map<string, string>();
    initialQuestions.forEach((question) => map.set(question.oppositionId, question.oppositionName));
    return map;
  }, [initialQuestions]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Profile;
      setProfile(parsed);
      setAlias(parsed.alias);
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (oppositionId && !topics.some((topic) => topic.id === topicId)) {
      setTopicId("");
    }
  }, [oppositionId, topicId, topics]);

  useEffect(() => {
    if (profile) {
      void loadQueue(queueLimit);
      void loadProgress(profile.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, oppositionId, topicId]);

  const practiceSummary = useMemo<RoundSummary>(() => {
    const results = queue
      .map((question) => practiceAnswers[question.id])
      .filter((result): result is RoundAnswer => Boolean(result));
    const correct = results.filter((result) => result.isCorrect).length;
    const score = results.reduce((total, result) => total + result.score, 0);
    const maxScore = results.reduce((total, result) => total + result.maxScore, 0);

    return {
      total: results.length,
      correct,
      wrong: results.length - correct,
      score,
      maxScore,
      grade: getGrade(score, maxScore),
      results
    };
  }, [practiceAnswers, queue]);

  async function saveAlias() {
    setMessage("");
    setIsLoading(true);

    try {
      const payload = await requestJson<{ profile: Profile }>("/api/profile", {
        method: "POST",
        body: JSON.stringify({ alias })
      });

      setProfile(payload.profile);
      setAlias(payload.profile.alias);
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload.profile));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el alias.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadQueue(limit = PRACTICE_ROUND_SIZE) {
    const params = new URLSearchParams();

    if (profile?.id) {
      params.set("profileId", profile.id);
    }

    if (oppositionId) {
      params.set("oppositionId", oppositionId);
    }

    if (topicId) {
      params.set("topicId", topicId);
    }

    params.set("limit", String(limit));

    setIsLoading(true);
    setMessage("");

    try {
      const payload = await requestJson<{ questions: PublicQuestion[] }>(
        `/api/study/queue?${params.toString()}`
      );
      setQueue(payload.questions);
      setCurrentIndex(0);
      setSelectedOptionId("");
      setAnswerResult(null);
      setPracticeAnswers({});
      setPracticeRoundFinished(false);
      setExamAnswers({});
      setExamResult(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar preguntas.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProgress(profileId: string) {
    try {
      const payload = await requestJson<ProgressPayload>(`/api/progress?profileId=${profileId}`);
      setProgress(payload);
    } catch {
      setProgress(null);
    }
  }

  async function submitPracticeAnswer() {
    if (!currentQuestion || !selectedOptionId) {
      return;
    }

    if (!profile) {
      setMessage("Introduce un alias antes de corregir para poder guardar el intento.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const payload = await requestJson<AnswerResult>("/api/answer", {
        method: "POST",
        body: JSON.stringify({
          profileId: profile.id,
          questionId: currentQuestion.id,
          selectedOptionId,
          mode: "practice"
        })
      });

      setAnswerResult(payload);
      setPracticeAnswers((answers) => ({
        ...answers,
        [currentQuestion.id]: {
          ...payload,
          questionId: currentQuestion.id,
          selectedOptionId
        }
      }));
      await loadProgress(profile.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo corregir.");
    } finally {
      setIsLoading(false);
    }
  }

  function nextPracticeQuestion() {
    setAnswerResult(null);
    setSelectedOptionId("");

    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((index) => index + 1);
    }
  }

  function finishPracticeRound() {
    setPracticeRoundFinished(true);
  }

  async function finishExam() {
    if (!queue.length) {
      return;
    }

    if (!profile) {
      setMessage("Introduce un alias antes de finalizar para poder guardar el intento.");
      return;
    }

    const answeredCount = queue.filter((question) => examAnswers[question.id]).length;
    const shouldFinish = window.confirm(
      `Has seleccionado ${answeredCount} de ${queue.length} preguntas.\n\n¿Deseas terminar la prueba?`
    );

    if (!shouldFinish) {
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const payload = await requestJson<ExamResult>("/api/exam/submit", {
        method: "POST",
        body: JSON.stringify({
          profileId: profile.id,
          answers: queue.map((question) => ({
            questionId: question.id,
            selectedOptionId: examAnswers[question.id] ?? null
          }))
        })
      });

      setExamResult(payload);
      await loadProgress(profile.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar el examen.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border border-ink/10 bg-white/85 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-tide">Opos App</p>
          <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
            Estudio tipo test
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-80 sm:flex-row">
          <label className="relative flex-1">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/45" />
            <input
              className="h-11 w-full rounded-md border border-ink/15 bg-white pl-10 pr-3 text-sm text-ink shadow-sm"
              onChange={(event) => setAlias(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void saveAlias();
                }
              }}
              placeholder="Alias"
              value={alias}
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-tide/90 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isLoading || !alias.trim()}
            onClick={() => void saveAlias()}
            title="Guardar alias"
            type="button"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Entrar
          </button>
        </div>
      </header>

      {message ? (
        <div className="rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-4 rounded-lg border border-ink/10 bg-white/85 p-4 shadow-soft">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <TabButton
              active={tab === "practice"}
              icon={<BookOpen className="size-4" />}
              label="Práctica"
              onClick={() => {
                setTab("practice");
                void loadQueue(PRACTICE_ROUND_SIZE);
              }}
            />
            <TabButton
              active={tab === "exam"}
              icon={<ClipboardList className="size-4" />}
              label="Examen"
              onClick={() => {
                setTab("exam");
                void loadQueue(EXAM_QUESTION_COUNT);
              }}
            />
            <TabButton
              active={tab === "progress"}
              icon={<BarChart3 className="size-4" />}
              label="Progreso"
              onClick={() => {
                setTab("progress");
                if (profile) {
                  void loadProgress(profile.id);
                }
              }}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink/75">
              Oposición
              <select
                className="mt-1 h-10 w-full rounded-md border border-ink/15 bg-white px-3 text-sm"
                onChange={(event) => setOppositionId(event.target.value)}
                value={oppositionId}
              >
                <option value="">Todas</option>
                {oppositions.map((opposition) => (
                  <option key={opposition.id} value={opposition.id}>
                    {opposition.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-ink/75">
              Tema
              <select
                className="mt-1 h-10 w-full rounded-md border border-ink/15 bg-white px-3 text-sm"
                onChange={(event) => setTopicId(event.target.value)}
                value={topicId}
              >
                <option value="">Todos</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink transition hover:bg-ink/5"
              onClick={() => void loadQueue(queueLimit)}
              title="Recargar preguntas"
              type="button"
            >
              <RotateCcw className="size-4" />
              Recargar
            </button>
          </div>

          <div className="rounded-md bg-ink/[0.04] p-3 text-sm text-ink/70">
            {profile ? (
              <span>
                Perfil activo: <strong className="text-ink">{profile.alias}</strong>
              </span>
            ) : (
              <span>Introduce un alias para guardar el progreso.</span>
            )}
          </div>
        </aside>

        <section className="min-h-[620px] rounded-lg border border-ink/10 bg-white/90 p-4 shadow-soft sm:p-5">
          {tab === "practice" ? (
            <PracticePanel
              answerResult={answerResult}
              currentIndex={currentIndex}
              isLoading={isLoading}
              onFinish={finishPracticeRound}
              onNext={nextPracticeQuestion}
              onRestart={() => void loadQueue(PRACTICE_ROUND_SIZE)}
              onSelect={setSelectedOptionId}
              onSubmit={() => void submitPracticeAnswer()}
              roundFinished={practiceRoundFinished}
              summary={practiceSummary}
              question={currentQuestion}
              queue={queue}
              queueLength={queue.length}
              selectedOptionId={selectedOptionId}
            />
          ) : null}

          {tab === "exam" ? (
            <ExamPanel
              answers={examAnswers}
              currentIndex={currentIndex}
              examResult={examResult}
              isLoading={isLoading}
              onAnswer={(questionId, optionId) =>
                setExamAnswers((answers) => ({ ...answers, [questionId]: optionId }))
              }
              onFinish={() => void finishExam()}
              onMove={setCurrentIndex}
              queue={queue}
            />
          ) : null}

          {tab === "progress" ? (
            <ProgressPanel
              oppositionNames={oppositionNames}
              progress={progress}
              topicNames={topicNames}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-ink text-white" : "border border-ink/15 bg-white text-ink hover:bg-ink/5"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function PracticePanel({
  answerResult,
  currentIndex,
  isLoading,
  onFinish,
  onNext,
  onRestart,
  onSelect,
  onSubmit,
  roundFinished,
  question,
  queue,
  queueLength,
  selectedOptionId,
  summary
}: {
  answerResult: AnswerResult | null;
  currentIndex: number;
  isLoading: boolean;
  onFinish: () => void;
  onNext: () => void;
  onRestart: () => void;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  roundFinished: boolean;
  question: PublicQuestion | undefined;
  queue: PublicQuestion[];
  queueLength: number;
  selectedOptionId: string;
  summary: RoundSummary;
}) {
  if (roundFinished) {
    return <RoundResultPanel onRestart={onRestart} queue={queue} summary={summary} />;
  }

  if (!question) {
    return <EmptyState text="No hay preguntas para este filtro." />;
  }

  const correctOption = answerResult
    ? question.options.find((option) => option.id === answerResult.correctOptionId)
    : null;
  const isLastQuestion = currentIndex === queueLength - 1;

  return (
    <div className="flex h-full flex-col gap-5">
      <PanelHeading
        eyebrow={getQuestionLabel(question)}
        title={`Pregunta ${currentIndex + 1} de ${queueLength}`}
      />
      <QuestionBlock
        answerResult={answerResult}
        onSelect={onSelect}
        question={question}
        selectedOptionId={selectedOptionId}
      />
      {answerResult ? (
        <div
          className={`rounded-md border p-4 ${
            answerResult.isCorrect
              ? "border-moss/30 bg-moss/10 text-moss"
              : "border-coral/30 bg-coral/10 text-coral"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {answerResult.isCorrect ? <Check className="size-4" /> : <X className="size-4" />}
            {answerResult.isCorrect ? "Correcta" : "Incorrecta"}
          </div>
          <p className="mt-2 text-sm text-ink/75">
            Respuesta correcta:{" "}
            <strong>
              {answerResult.correctOptionId}
              {correctOption ? ` · ${correctOption.text}` : ""}
            </strong>
          </p>
          {answerResult.explanation ? (
            <p className="mt-2 text-sm text-ink/75">{answerResult.explanation}</p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex justify-end gap-2">
        {answerResult ? (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90"
            onClick={isLastQuestion ? onFinish : onNext}
            type="button"
          >
            {isLastQuestion ? (
              <>
                Finalizar
                <Check className="size-4" />
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        ) : (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isLoading || !selectedOptionId}
            onClick={onSubmit}
            type="button"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Corregir
          </button>
        )}
      </div>
    </div>
  );
}

function ExamPanel({
  answers,
  currentIndex,
  examResult,
  isLoading,
  onAnswer,
  onFinish,
  onMove,
  queue
}: {
  answers: Record<string, string>;
  currentIndex: number;
  examResult: ExamResult | null;
  isLoading: boolean;
  onAnswer: (questionId: string, optionId: string) => void;
  onFinish: () => void;
  onMove: (index: number) => void;
  queue: PublicQuestion[];
}) {
  const question = queue[currentIndex];

  if (!queue.length) {
    return <EmptyState text="No hay preguntas para montar un examen con este filtro." />;
  }

  if (examResult) {
    return (
      <div className="flex flex-col gap-5">
        <PanelHeading eyebrow="Examen finalizado" title="Resultado" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Calificación" value={`${examResult.summary.grade.toFixed(2)} / 10`} />
          <Metric label="Aciertos" value={examResult.summary.correct} />
          <Metric label="Fallos" value={examResult.summary.wrong} />
          <Metric label="Blancas" value={examResult.summary.blank} />
          <Metric
            label="Puntuación"
            value={`${examResult.summary.score.toFixed(2)} / ${examResult.summary.maxScore.toFixed(2)}`}
          />
        </div>
        <div className="space-y-3">
          {queue.map((item, index) => {
            const result = examResult.results.find((entry) => entry.questionId === item.id);
            const correctOption = item.options.find(
              (option) => option.id === result?.correctOptionId
            );

            return (
              <div
                className={`rounded-md border p-3 ${
                  result?.isCorrect
                    ? "border-moss/30 bg-moss/10"
                    : "border-coral/25 bg-coral/5"
                }`}
                key={item.id}
              >
                <p className="text-sm font-semibold text-ink">
                  {index + 1}. {item.prompt}
                </p>
                {result ? (
                  <>
                    <p className="mt-2 text-sm text-ink/70">
                      Marcada: {answers[item.id] ?? "Blanco"} · Correcta:{" "}
                      {result.correctOptionId}
                      {correctOption ? ` · ${correctOption.text}` : ""}
                    </p>
                    {result.explanation ? (
                      <p className="mt-2 text-sm text-ink/70">{result.explanation}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <PanelHeading
        eyebrow={getQuestionLabel(question)}
        title={`Examen · Pregunta ${currentIndex + 1} de ${queue.length}`}
      />
      <QuestionBlock
        onSelect={(optionId) => onAnswer(question.id, optionId)}
        question={question}
        selectedOptionId={answers[question.id] ?? ""}
      />
      <div className="mt-auto flex w-full flex-row items-center justify-between gap-2">
        <div className="flex flex-1 justify-start">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink transition hover:bg-ink/5 disabled:opacity-50"
            disabled={currentIndex === 0}
            onClick={() => onMove(Math.max(0, currentIndex - 1))}
            type="button"
          >
            <ArrowLeft className="size-4" />
            Anterior
          </button>
        </div>
        <div className="flex flex-1 justify-center">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isLoading}
            onClick={onFinish}
            type="button"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Finalizar examen
          </button>
        </div>
        <div className="flex flex-1 justify-end">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/15 bg-white px-3 text-sm font-semibold text-ink transition hover:bg-ink/5 disabled:opacity-50"
            disabled={currentIndex === queue.length - 1}
            onClick={() => onMove(Math.min(queue.length - 1, currentIndex + 1))}
            type="button"
          >
            Siguiente
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RoundResultPanel({
  onRestart,
  queue,
  summary
}: {
  onRestart: () => void;
  queue: PublicQuestion[];
  summary: RoundSummary;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-tide">Ronda finalizada</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
            Calificación {summary.grade.toFixed(2)} / 10
          </h2>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90"
          onClick={onRestart}
          type="button"
        >
          <RotateCcw className="size-4" />
          Nueva ronda
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Aciertos" value={summary.correct} />
        <Metric label="Fallos" value={summary.wrong} />
        <Metric label="Preguntas" value={summary.total} />
        <Metric
          label="Puntuación"
          value={`${summary.score.toFixed(2)} / ${summary.maxScore.toFixed(2)}`}
        />
      </div>
      <div className="space-y-3">
        {queue.map((item, index) => {
          const result = summary.results.find((entry) => entry.questionId === item.id);
          const selectedOption = item.options.find(
            (option) => option.id === result?.selectedOptionId
          );
          const correctOption = item.options.find(
            (option) => option.id === result?.correctOptionId
          );

          return (
            <div
              className={`rounded-md border p-3 ${
                result?.isCorrect ? "border-moss/30 bg-moss/10" : "border-coral/25 bg-coral/5"
              }`}
              key={item.id}
            >
              <p className="text-sm font-semibold text-ink">
                {index + 1}. {item.prompt}
              </p>
              {result ? (
                <>
                  <p className="mt-2 text-sm text-ink/70">
                    Marcada: {result.selectedOptionId}
                    {selectedOption ? ` · ${selectedOption.text}` : ""} · Correcta:{" "}
                    {result.correctOptionId}
                    {correctOption ? ` · ${correctOption.text}` : ""}
                  </p>
                  {result.explanation ? (
                    <p className="mt-2 text-sm text-ink/70">{result.explanation}</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-ink/70">Sin respuesta registrada.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressPanel({
  oppositionNames,
  progress,
  topicNames
}: {
  oppositionNames: Map<string, string>;
  progress: ProgressPayload | null;
  topicNames: Map<string, string>;
}) {
  if (!progress) {
    return <EmptyState text="Entra con un alias para ver tu progreso." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PanelHeading eyebrow="Progreso" title={`${progress.progress.totalAttempts} intentos`} />
      <div className="grid gap-3 sm:grid-cols-3">
        {progress.progress.byOpposition.map((item) => (
          <Metric
            key={item.oppositionId}
            label={oppositionNames.get(item.oppositionId) ?? item.oppositionId}
            value={`${getAccuracy(item.correct, item.attempts)}%`}
          />
        ))}
        {!progress.progress.byOpposition.length ? (
          <EmptyState text="Todavía no hay intentos registrados." />
        ) : null}
      </div>
      <div className="overflow-hidden rounded-md border border-ink/10">
        <div className="grid grid-cols-[1fr_90px_90px] bg-ink/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-normal text-ink/65">
          <span>Tema</span>
          <span>Acierto</span>
          <span>Intentos</span>
        </div>
        {progress.progress.byTopic
          .sort((a, b) => getAccuracy(a.correct, a.attempts) - getAccuracy(b.correct, b.attempts))
          .map((topic) => (
            <div
              className="grid grid-cols-[1fr_90px_90px] border-t border-ink/10 px-3 py-3 text-sm"
              key={`${topic.oppositionId}:${topic.topicId}`}
            >
              <span>{topicNames.get(topic.topicId) ?? topic.topicId}</span>
              <span>{getAccuracy(topic.correct, topic.attempts)}%</span>
              <span>{topic.attempts}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function QuestionBlock({
  answerResult,
  onSelect,
  question,
  selectedOptionId
}: {
  answerResult?: AnswerResult | null;
  onSelect: (optionId: string) => void;
  question: PublicQuestion;
  selectedOptionId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold leading-relaxed text-ink">{question.prompt}</p>
      <div className="grid gap-3">
        {question.options.map((option) => {
          const selected = selectedOptionId === option.id;
          const correct = answerResult?.correctOptionId === option.id;
          const wrongSelected = answerResult && selected && !correct;

          return (
            <button
              className={`flex min-h-14 items-start gap-3 rounded-md border p-3 text-left text-sm transition ${
                correct
                  ? "border-moss/40 bg-moss/10"
                  : wrongSelected
                    ? "border-coral/40 bg-coral/10"
                    : selected
                      ? "border-tide/50 bg-tide/10"
                      : "border-ink/10 bg-white hover:bg-ink/[0.03]"
              }`}
              disabled={Boolean(answerResult)}
              key={option.id}
              onClick={() => onSelect(option.id)}
              type="button"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-white text-xs font-bold">
                {option.id}
              </span>
              <span className="pt-1 text-ink/85">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b border-ink/10 pb-4">
      <p className="text-sm font-medium text-tide">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">{title}</h2>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white p-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-ink/20 bg-ink/[0.03] p-6 text-center text-sm text-ink/65">
      {text}
    </div>
  );
}
