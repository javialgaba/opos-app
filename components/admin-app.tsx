"use client";

import {
  Check,
  FileJson,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { questionPackSchema, type QuestionPack } from "@/lib/content/schema";

type EditablePack = QuestionPack & {
  sourcePath: string;
};

type AdminResponse = {
  packs: EditablePack[];
};

const ADMIN_SECRET_KEY = "opos.adminSecret";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

async function requestAdmin<T>(url: string, secret: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret,
      ...init?.headers
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "La petición de admin ha fallado.");
  }

  return payload as T;
}

function createQuestion(topicId: string) {
  const id = `pregunta-${Date.now().toString(36)}`;

  return {
    id,
    topicId,
    prompt: "Nueva pregunta",
    options: [
      { id: "A", text: "Opción A" },
      { id: "B", text: "Opción B" },
      { id: "C", text: "Opción C" },
      { id: "D", text: "Opción D" }
    ],
    correctOptionId: "A",
    explanation: ""
  };
}

export function AdminApp() {
  const [secret, setSecret] = useState("");
  const [packs, setPacks] = useState<EditablePack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedQuestion =
    selectedPack?.questions.find((question) => question.id === selectedQuestionId) ??
    selectedPack?.questions[0] ??
    null;

  const validation = useMemo(() => {
    if (!selectedPack) {
      return null;
    }

    const parsed = questionPackSchema.safeParse(selectedPack);
    return parsed.success
      ? { ok: true, errors: [] as string[] }
      : {
          ok: false,
          errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        };
  }, [selectedPack]);

  function updateSelectedPack(updater: (pack: EditablePack) => EditablePack) {
    if (!selectedPack) {
      return;
    }

    setPacks((current) => current.map((pack) => (pack.id === selectedPack.id ? updater(pack) : pack)));
  }

  function replaceQuestion(questionId: string, updater: (question: QuestionPack["questions"][number]) => QuestionPack["questions"][number]) {
    updateSelectedPack((pack) => ({
      ...pack,
      questions: pack.questions.map((question) =>
        question.id === questionId ? updater(question) : question
      )
    }));
  }

  async function loadPacks() {
    setMessage("");
    setIsLoading(true);

    try {
      const payload = await requestAdmin<AdminResponse>("/api/admin/packs", secret);
      setPacks(payload.packs);
      setSelectedPackId(payload.packs[0]?.id ?? "");
      setSelectedQuestionId(payload.packs[0]?.questions[0]?.id ?? "");
      window.sessionStorage.setItem(ADMIN_SECRET_KEY, secret);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo entrar en admin.");
    } finally {
      setIsLoading(false);
    }
  }

  async function savePack() {
    if (!selectedPack) {
      return;
    }

    setMessage("");
    setIsLoading(true);

    try {
      const parsed = questionPackSchema.parse(selectedPack);
      await requestAdmin("/api/admin/packs", secret, {
        method: "POST",
        body: JSON.stringify({
          filePath: selectedPack.sourcePath,
          pack: parsed
        })
      });
      setMessage("Pack guardado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setIsLoading(false);
    }
  }

  async function importJson(file: File) {
    setMessage("");

    try {
      const text = await file.text();
      const pack = questionPackSchema.parse(JSON.parse(text));
      const editable = {
        ...pack,
        sourcePath: `content/imported/${pack.id}.json`
      };

      setPacks((current) => {
        const rest = current.filter((item) => item.id !== editable.id);
        return [...rest, editable];
      });
      setSelectedPackId(editable.id);
      setSelectedQuestionId(editable.questions[0]?.id ?? "");
      setMessage("JSON importado. Revisa y guarda para publicarlo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo importar el JSON.");
    }
  }

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_SECRET_KEY);
    if (stored) {
      setSecret(stored);
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border border-ink/10 bg-white/90 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-tide">Administración</p>
          <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
            Banco de preguntas
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:min-w-[420px] sm:flex-row">
          <label className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/45" />
            <input
              className="h-11 w-full rounded-md border border-ink/15 bg-white pl-10 pr-3 text-sm shadow-sm"
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Clave de administración"
              type="password"
              value={secret}
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90 disabled:opacity-50"
            disabled={isLoading || !secret}
            onClick={() => void loadPacks()}
            type="button"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Entrar
          </button>
        </div>
      </header>

      {message ? (
        <div className="rounded-md border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-ink">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4 rounded-lg border border-ink/10 bg-white/90 p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Packs</h2>
            <button
              className="inline-flex size-9 items-center justify-center rounded-md border border-ink/15 bg-white text-ink transition hover:bg-ink/5"
              onClick={() => fileInputRef.current?.click()}
              title="Importar JSON"
              type="button"
            >
              <Upload className="size-4" />
            </button>
            <input
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void importJson(file);
                }
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
          </div>
          <div className="scrollbar-thin max-h-[360px] space-y-2 overflow-auto">
            {packs.map((pack) => (
              <button
                className={`w-full rounded-md border p-3 text-left transition ${
                  pack.id === selectedPackId
                    ? "border-tide/40 bg-tide/10"
                    : "border-ink/10 bg-white hover:bg-ink/[0.03]"
                }`}
                key={pack.id}
                onClick={() => {
                  setSelectedPackId(pack.id);
                  setSelectedQuestionId(pack.questions[0]?.id ?? "");
                }}
                type="button"
              >
                <span className="block text-sm font-semibold text-ink">{pack.title}</span>
                <span className="mt-1 block text-xs text-ink/60">{pack.sourcePath}</span>
              </button>
            ))}
          </div>
          {selectedPack ? (
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-tide px-4 text-sm font-semibold text-white transition hover:bg-tide/90 disabled:opacity-50"
              disabled={isLoading || validation?.ok === false}
              onClick={() => void savePack()}
              type="button"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar pack
            </button>
          ) : null}
        </aside>

        <section className="rounded-lg border border-ink/10 bg-white/90 p-4 shadow-soft sm:p-5">
          {selectedPack ? (
            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
              <div className="space-y-5">
                <PackFields pack={selectedPack} updateSelectedPack={updateSelectedPack} />
                <TopicsEditor pack={selectedPack} updateSelectedPack={updateSelectedPack} />
                {selectedQuestion ? (
                  <QuestionEditor
                  pack={selectedPack}
                  question={selectedQuestion}
                  replaceQuestion={replaceQuestion}
                  updateSelectedPack={updateSelectedPack}
                />
                ) : (
                  <EmptyState text="Crea una pregunta para empezar." />
                )}
                {validation && !validation.ok ? (
                  <div className="rounded-md border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                    {validation.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                ) : null}
              </div>
              <QuestionList
                pack={selectedPack}
                selectedQuestionId={selectedQuestion?.id ?? ""}
                setSelectedQuestionId={setSelectedQuestionId}
                updateSelectedPack={updateSelectedPack}
              />
            </div>
          ) : (
            <EmptyState text="Entra con la clave de administración para cargar preguntas." />
          )}
        </section>
      </section>
    </main>
  );
}

function PackFields({
  pack,
  updateSelectedPack
}: {
  pack: EditablePack;
  updateSelectedPack: (updater: (pack: EditablePack) => EditablePack) => void;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-ink/10 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-ink/75">
        Título
        <input
          className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
          onChange={(event) =>
            updateSelectedPack((current) => ({ ...current, title: event.target.value }))
          }
          value={pack.title}
        />
      </label>
      <label className="text-sm font-medium text-ink/75">
        Ruta
        <input
          className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
          onChange={(event) =>
            updateSelectedPack((current) => ({ ...current, sourcePath: event.target.value }))
          }
          value={pack.sourcePath}
        />
      </label>
      <label className="text-sm font-medium text-ink/75">
        Oposición
        <input
          className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
          onChange={(event) =>
            updateSelectedPack((current) => ({
              ...current,
              opposition: { ...current.opposition, name: event.target.value }
            }))
          }
          value={pack.opposition.name}
        />
      </label>
      <label className="text-sm font-medium text-ink/75">
        Penalización fallo
        <input
          className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
          onChange={(event) =>
            updateSelectedPack((current) => ({
              ...current,
              scoring: { ...current.scoring, wrong: Number(event.target.value) }
            }))
          }
          step="0.01"
          type="number"
          value={pack.scoring.wrong}
        />
      </label>
    </section>
  );
}

function TopicsEditor({
  pack,
  updateSelectedPack
}: {
  pack: EditablePack;
  updateSelectedPack: (updater: (pack: EditablePack) => EditablePack) => void;
}) {
  return (
    <section className="rounded-md border border-ink/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Temas</h2>
        <button
          className="inline-flex size-9 items-center justify-center rounded-md border border-ink/15 bg-white transition hover:bg-ink/5"
          onClick={() =>
            updateSelectedPack((current) => {
              const name = "Nuevo tema";
              const id = `${slugify(name)}-${current.topics.length + 1}`;
              return {
                ...current,
                topics: [...current.topics, { id, name }]
              };
            })
          }
          title="Añadir tema"
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {pack.topics.map((topic) => (
          <label className="text-sm font-medium text-ink/75" key={topic.id}>
            {topic.id}
            <input
              className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
              onChange={(event) =>
                updateSelectedPack((current) => ({
                  ...current,
                  topics: current.topics.map((item) =>
                    item.id === topic.id ? { ...item, name: event.target.value } : item
                  )
                }))
              }
              value={topic.name}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function QuestionList({
  pack,
  selectedQuestionId,
  setSelectedQuestionId,
  updateSelectedPack
}: {
  pack: EditablePack;
  selectedQuestionId: string;
  setSelectedQuestionId: (id: string) => void;
  updateSelectedPack: (updater: (pack: EditablePack) => EditablePack) => void;
}) {
  return (
    <aside className="flex flex-col gap-3 rounded-md border border-ink/10 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Preguntas</h2>
        <button
          className="inline-flex size-9 items-center justify-center rounded-md border border-ink/15 bg-white transition hover:bg-ink/5"
          onClick={() =>
            updateSelectedPack((current) => {
              const question = createQuestion(current.topics[0]?.id ?? "general");
              setSelectedQuestionId(question.id);
              return {
                ...current,
                questions: [...current.questions, question]
              };
            })
          }
          title="Añadir pregunta"
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="scrollbar-thin max-h-[620px] space-y-2 overflow-auto">
        {pack.questions.map((question, index) => (
          <button
            className={`w-full rounded-md border p-3 text-left text-sm transition ${
              question.id === selectedQuestionId
                ? "border-tide/40 bg-tide/10"
                : "border-ink/10 bg-white hover:bg-ink/[0.03]"
            }`}
            key={question.id}
            onClick={() => setSelectedQuestionId(question.id)}
            type="button"
          >
            <span className="block font-semibold text-ink">#{index + 1}</span>
            <span className="mt-1 line-clamp-2 block text-ink/70">{question.prompt}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function QuestionEditor({
  pack,
  question,
  replaceQuestion,
  updateSelectedPack
}: {
  pack: EditablePack;
  question: QuestionPack["questions"][number];
  replaceQuestion: (
    questionId: string,
    updater: (question: QuestionPack["questions"][number]) => QuestionPack["questions"][number]
  ) => void;
  updateSelectedPack: (updater: (pack: EditablePack) => EditablePack) => void;
}) {
  return (
    <section className="rounded-md border border-ink/10 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Editar pregunta</h2>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 text-sm font-semibold text-coral transition hover:bg-coral/15"
          onClick={() =>
            updateSelectedPack((current) => ({
              ...current,
              questions: current.questions.filter((item) => item.id !== question.id)
            }))
          }
          title="Eliminar pregunta"
          type="button"
        >
          <Trash2 className="size-4" />
          Eliminar
        </button>
      </div>
      <div className="grid gap-3">
        <label className="text-sm font-medium text-ink/75">
          ID
          <input
            className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
            onChange={(event) =>
              replaceQuestion(question.id, (current) => ({
                ...current,
                id: slugify(event.target.value)
              }))
            }
            value={question.id}
          />
        </label>
        <label className="text-sm font-medium text-ink/75">
          Tema
          <select
            className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
            onChange={(event) =>
              replaceQuestion(question.id, (current) => ({
                ...current,
                topicId: event.target.value
              }))
            }
            value={question.topicId}
          >
            {pack.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink/75">
          Enunciado
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-ink/15 p-3"
            onChange={(event) =>
              replaceQuestion(question.id, (current) => ({
                ...current,
                prompt: event.target.value
              }))
            }
            value={question.prompt}
          />
        </label>
        <div className="grid gap-2">
          {question.options.map((option, index) => (
            <label className="text-sm font-medium text-ink/75" key={option.id}>
              Opción {option.id}
              <input
                className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
                onChange={(event) =>
                  replaceQuestion(question.id, (current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    )
                  }))
                }
                value={option.text}
              />
            </label>
          ))}
        </div>
        <label className="text-sm font-medium text-ink/75">
          Respuesta correcta
          <select
            className="mt-1 h-10 w-full rounded-md border border-ink/15 px-3"
            onChange={(event) =>
              replaceQuestion(question.id, (current) => ({
                ...current,
                correctOptionId: event.target.value
              }))
            }
            value={question.correctOptionId}
          >
            {question.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink/75">
          Explicación
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-ink/15 p-3"
            onChange={(event) =>
              replaceQuestion(question.id, (current) => ({
                ...current,
                explanation: event.target.value
              }))
            }
            value={question.explanation ?? ""}
          />
        </label>
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-ink/20 bg-ink/[0.03] p-6 text-center text-sm text-ink/65">
      <FileJson className="mr-2 size-4" />
      {text}
    </div>
  );
}
