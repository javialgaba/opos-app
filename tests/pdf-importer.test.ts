import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDefaultPackOptions,
  buildQuestionPackFromPages,
  dedupeQuestions,
  parseQuestionsFromPages,
  type ImporterQuestion
} from "../lib/pdf-importer/pack";
import { parseAnswerKeyFromPages, segmentModelSections, type PdfPageText } from "../lib/pdf-importer/text";

function page(pageNumber: number, text: string): PdfPageText {
  return { pageNumber, text };
}

function answerRun(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const number = from + index;
    const option = ["A", "B", "C", "D"][number % 4];
    return `${number} ${option}`;
  }).join(" ");
}

function reserveRun() {
  return Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const option = ["D", "C", "B", "A"][index % 4];
    return `R${number} ${option}`;
  }).join(" ");
}

function simpleQuestion(modelId: string, questionNumber: string, correctOptionId = "A") {
  return {
    modelId,
    questionNumber,
    prompt: "Capital administrativa",
    options: [
      { id: "A", text: "Alfa" },
      { id: "B", text: "Beta" },
      { id: "C", text: "Gamma" },
      { id: "D", text: "Delta" }
    ],
    correctOptionId
  } as ImporterQuestion;
}

function packOptions(overrides: Partial<Parameters<typeof buildDefaultPackOptions>[0]> = {}) {
  return buildDefaultPackOptions({
    defaultBaseName: "fixture",
    oppositionName: "C2",
    topicName: "Ayuntamiento",
    dedupe: true,
    failOnMissingAnswer: true,
    ...overrides
  });
}

test("parses multi-page answer keys with regular and reserve questions", () => {
  const footer =
    "Cód. Validación: ABC Verificación: https://example.test Documento firmado electrónicamente";
  const answers = parseAnswerKeyFromPages([
    page(1, `MODELO 1 RESPUESTA ${answerRun(1, 33)}\n${footer}\n34 C ${answerRun(35, 40)}`),
    page(2, answerRun(41, 100)),
    page(3, reserveRun())
  ]);

  assert.equal(answers.size, 110);
  assert.equal(answers.get("1"), "B");
  assert.equal(answers.get("34"), "C");
  assert.equal(answers.get("100"), "A");
  assert.equal(answers.get("R1"), "D");
  assert.equal(answers.get("R10"), "C");
});

test("segments several model blocks and their answer pages", () => {
  const sections = segmentModelSections([
    page(1, "Anuncio sin preguntas"),
    page(2, "MODELO 1\n1. Pregunta\nA) A\nB) B\nC) C\nD) D"),
    page(3, "MODELO 1 RESPUESTA 1 A"),
    page(4, "2 B"),
    page(5, "MODELO 2\n1. Pregunta\nA) A\nB) B\nC) C\nD) D"),
    page(6, "MODELO 2 RESPUESTA 1 B")
  ]);

  assert.equal(sections.length, 2);
  assert.deepEqual(
    sections.map((section) => ({
      modelId: section.modelId,
      questionPages: section.questionPages.map((item) => item.pageNumber),
      answerPages: section.answerPages.map((item) => item.pageNumber)
    })),
    [
      { modelId: "1", questionPages: [2], answerPages: [3, 4] },
      { modelId: "2", questionPages: [5], answerPages: [6] }
    ]
  );
});

test("assigns answers by model instead of using a global answer table", () => {
  const questions = parseQuestionsFromPages(
    [
      page(1, "MODELO 1\n1. Color correcto:\nA) Rojo\nB) Azul\nC) Verde\nD) Negro"),
      page(2, "MODELO 1 RESPUESTA 1 B"),
      page(3, "MODELO 2\n1. Color correcto:\nA) Rojo\nB) Azul\nC) Verde\nD) Negro"),
      page(4, "MODELO 2 RESPUESTA 1 C")
    ],
    { failOnMissingAnswer: true }
  );

  assert.deepEqual(
    questions.map((question) => ({
      modelId: question.modelId,
      questionNumber: question.questionNumber,
      correctOptionId: question.correctOptionId
    })),
    [
      { modelId: "1", questionNumber: "1", correctOptionId: "B" },
      { modelId: "2", questionNumber: "1", correctOptionId: "C" }
    ]
  );
});

test("does not confuse lowercase prompt continuations with options", () => {
  const questions = parseQuestionsFromPages(
    [
      page(
        1,
        [
          "MODELO 1",
          "1. Respecto de la notificación, señale la afirmación correcta conforme",
          "a la Ley 39/2015 del Procedimiento Administrativo Común:",
          "A) Texto íntegro con recursos y plazo.",
          "B) Es válida aunque omita el plazo.",
          "C) Debe practicarse siempre por boletín.",
          "D) Puede sustituirse por una comunicación informal."
        ].join("\n")
      ),
      page(2, "MODELO 1 RESPUESTA 1 A")
    ],
    { failOnMissingAnswer: true }
  );

  assert.equal(questions.length, 1);
  assert.equal(questions[0].questionNumber, "1");
  assert.equal(questions[0].correctOptionId, "A");
  assert.match(questions[0].prompt, /conforme a la Ley 39\/2015/);
});

test("dedupes questions with reordered options by correct option text", () => {
  const questions: ImporterQuestion[] = [
    {
      modelId: "1",
      questionNumber: "1",
      prompt: "El municipio es:",
      options: [
        { id: "A", text: "La entidad local básica" },
        { id: "B", text: "Un ministerio" },
        { id: "C", text: "Un órgano judicial" },
        { id: "D", text: "Una empresa pública" }
      ],
      correctOptionId: "A"
    },
    {
      modelId: "2",
      questionNumber: "12",
      prompt: "El municipio es:",
      options: [
        { id: "A", text: "Un ministerio" },
        { id: "B", text: "La entidad local básica" },
        { id: "C", text: "Una empresa pública" },
        { id: "D", text: "Un órgano judicial" }
      ],
      correctOptionId: "B"
    }
  ];

  const deduped = dedupeQuestions(questions);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].correctOptionId, "A");
  assert.deepEqual(deduped[0].sources, [
    { modelId: "1", questionNumber: "1" },
    { modelId: "2", questionNumber: "12" }
  ]);
});

test("throws when deduped questions disagree on the correct answer text", () => {
  assert.throws(
    () => dedupeQuestions([simpleQuestion("1", "1", "A"), simpleQuestion("2", "2", "B")]),
    /Conflicto de respuesta/
  );
});

test("fails in automatic mode when an answer is missing", () => {
  assert.throws(
    () =>
      buildQuestionPackFromPages(
        [
          page(1, "MODELO 1\n1. Pregunta sin respuesta:\nA) A\nB) B\nC) C\nD) D"),
          page(2, "MODELO 1 RESPUESTA 2 B")
        ],
        packOptions()
      ),
    /Falta respuesta/
  );
});

test("keeps compatibility with a simple single-block PDF text", () => {
  const pack = buildQuestionPackFromPages(
    [
      page(
        1,
        "1. Pregunta simple:\nA) Opción A\nB) Opción B\nC) Opción C\nD) Opción D\nRESPUESTAS 1 B"
      )
    ],
    packOptions()
  );

  assert.equal(pack.questions.length, 1);
  assert.equal(pack.questions[0].correctOptionId, "B");
  assert.deepEqual(pack.questions[0].sources, [{ modelId: "default", questionNumber: "1" }]);
});
