import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { questionPackSchema, type QuestionPack } from "../lib/content/schema";

type CandidateQuestion = {
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
};

type MutableCandidate = CandidateQuestion & {
  topicId: string;
  explanation: string;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

const OPTION_IDS = ["A", "B", "C", "D"];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function normalizeOptionId(value: string) {
  const upper = value.trim().toUpperCase();
  const numeric: Record<string, string> = {
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "D"
  };

  return numeric[upper] ?? upper;
}

async function extractTextFromPdf(filePath: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = await fs.readFile(filePath);
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, string[]>();

    for (const item of content.items as PdfTextItem[]) {
      const text = item.str?.trim();
      const y = item.transform?.[5];

      if (!text || typeof y !== "number") {
        continue;
      }

      const key = Math.round(y);
      const row = rows.get(key) ?? [];
      row.push(text);
      rows.set(key, row);
    }

    const pageText = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(" "))
      .join("\n");

    pages.push(pageText);
  }

  return pages.join("\n\n");
}

function parseAnswerKeys(lines: string[]) {
  const answers = new Map<number, string>();
  const keyStart = lines.findIndex((line) =>
    /soluciones|respuestas|plantilla|clave/i.test(line)
  );

  if (keyStart === -1) {
    return answers;
  }

  const keyText = lines.slice(keyStart).join(" ");
  const matches = keyText.matchAll(/(?:^|\s)(\d{1,3})[\).\:\-\s]+([A-Da-d1-4])(?=\s|$)/g);

  for (const match of matches) {
    answers.set(Number(match[1]), normalizeOptionId(match[2]));
  }

  return answers;
}

function parseCandidates(text: string): CandidateQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const answerKeys = parseAnswerKeys(lines);
  const candidates: CandidateQuestion[] = [];
  let current:
    | {
        number: number;
        promptParts: string[];
        options: Array<{ id: string; text: string }>;
        correctOptionId: string;
      }
    | null = null;

  function flush() {
    if (!current) {
      return;
    }

    if (current.options.length === 4) {
      const keyAnswer = answerKeys.get(current.number);
      candidates.push({
        prompt: current.promptParts.join(" ").trim(),
        options: current.options,
        correctOptionId: normalizeOptionId(current.correctOptionId || keyAnswer || "")
      });
    }

    current = null;
  }

  for (const line of lines) {
    const questionMatch = line.match(/^(?:pregunta\s*)?(\d{1,3})[\).\-\s]+(.+)$/i);
    const optionMatch = line.match(/^([A-Da-d1-4])[\).\-\s]+(.+)$/);
    const answerMatch = line.match(
      /^(?:respuesta|soluci[oó]n|correcta|clave)\s*(?:correcta)?\s*[:\-\s]+([A-Da-d1-4])$/i
    );

    if (questionMatch && !optionMatch) {
      flush();
      current = {
        number: Number(questionMatch[1]),
        promptParts: [questionMatch[2]],
        options: [],
        correctOptionId: ""
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (optionMatch && current.options.length < 4) {
      current.options.push({
        id: normalizeOptionId(optionMatch[1]),
        text: optionMatch[2].trim()
      });
      continue;
    }

    if (answerMatch) {
      current.correctOptionId = normalizeOptionId(answerMatch[1]);
      continue;
    }

    if (current.options.length === 0) {
      current.promptParts.push(line);
    } else if (current.options.length > 0 && current.options.length < 4) {
      const lastOption = current.options[current.options.length - 1];
      lastOption.text = `${lastOption.text} ${line}`.trim();
    }
  }

  flush();

  return candidates.filter((candidate) => {
    const optionIds = new Set(candidate.options.map((option) => option.id));
    return OPTION_IDS.every((id) => optionIds.has(id));
  });
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string
) {
  const answer = await rl.question(`${label}${defaultValue ? ` [${defaultValue}]` : ""}: `);
  return answer.trim() || defaultValue;
}

async function reviewCandidate(
  rl: ReturnType<typeof createInterface>,
  candidate: CandidateQuestion,
  topicId: string,
  index: number,
  total: number
): Promise<MutableCandidate | null> {
  console.log("\n────────────────────────────────────────");
  console.log(`Pregunta candidata ${index + 1}/${total}`);
  console.log(candidate.prompt);
  for (const option of candidate.options) {
    console.log(`${option.id}) ${option.text}`);
  }
  console.log(`Correcta detectada: ${candidate.correctOptionId || "sin detectar"}`);

  const action = (
    await rl.question("Usar esta pregunta? [s]í / [e]ditar / [n]o / [q] salir: ")
  )
    .trim()
    .toLowerCase();

  if (action === "q") {
    throw new Error("Importación cancelada por el usuario.");
  }

  if (action === "n") {
    return null;
  }

  const reviewed: MutableCandidate = {
    ...candidate,
    topicId,
    explanation: ""
  };

  if (action === "e") {
    reviewed.prompt = await askWithDefault(rl, "Enunciado", reviewed.prompt);
    reviewed.options = [];

    for (const id of OPTION_IDS) {
      const existing = candidate.options.find((option) => option.id === id)?.text ?? "";
      reviewed.options.push({
        id,
        text: await askWithDefault(rl, `Opción ${id}`, existing)
      });
    }
  }

  reviewed.correctOptionId = normalizeOptionId(
    await askWithDefault(rl, "Respuesta correcta (A/B/C/D)", reviewed.correctOptionId)
  );
  reviewed.topicId = slugify(await askWithDefault(rl, "Tema", reviewed.topicId));
  reviewed.explanation = await askWithDefault(rl, "Explicación opcional", "");

  return reviewed;
}

async function main() {
  const rl = createInterface({ input, output });

  try {
    const argumentPath = process.argv[2];
    const pdfPath = argumentPath
      ? path.resolve(argumentPath)
      : path.resolve(await rl.question("Ruta del PDF: "));
    const defaultBaseName = slugify(path.basename(pdfPath, path.extname(pdfPath)));

    console.log(`Leyendo ${pdfPath}...`);
    const text = await extractTextFromPdf(pdfPath);
    const candidates = parseCandidates(text);

    if (!candidates.length) {
      throw new Error("No se detectaron preguntas con 4 opciones en el PDF.");
    }

    console.log(`Detectadas ${candidates.length} preguntas candidatas.`);

    const oppositionName = await askWithDefault(rl, "Nombre de la oposición", "Oposición");
    const oppositionId = slugify(
      await askWithDefault(rl, "ID de la oposición", slugify(oppositionName))
    );
    const packTitle = await askWithDefault(rl, "Título del pack", defaultBaseName);
    const packId = slugify(await askWithDefault(rl, "ID del pack", defaultBaseName));
    const topicName = await askWithDefault(rl, "Tema por defecto", "General");
    const topicId = slugify(await askWithDefault(rl, "ID del tema", slugify(topicName)));
    const wrongScore = Number(await askWithDefault(rl, "Penalización por fallo", "-0.33"));
    const accepted: MutableCandidate[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const reviewed = await reviewCandidate(rl, candidates[index], topicId, index, candidates.length);

      if (reviewed) {
        accepted.push(reviewed);
      }
    }

    if (!accepted.length) {
      throw new Error("No se aceptó ninguna pregunta.");
    }

    const topics = new Map<string, string>();
    topics.set(topicId, topicName);
    accepted.forEach((question) => {
      if (!topics.has(question.topicId)) {
        topics.set(question.topicId, question.topicId);
      }
    });

    const pack: QuestionPack = {
      formatVersion: 1,
      id: packId,
      opposition: {
        id: oppositionId,
        name: oppositionName
      },
      title: packTitle,
      scoring: {
        correct: 1,
        wrong: Number.isFinite(wrongScore) ? wrongScore : -0.33,
        blank: 0
      },
      topics: Array.from(topics, ([id, name]) => ({ id, name })),
      questions: accepted.map((question, index) => ({
        id: `${packId}-${String(index + 1).padStart(3, "0")}`,
        topicId: question.topicId,
        prompt: question.prompt,
        options: OPTION_IDS.map((id) => {
          const option = question.options.find((item) => item.id === id);
          return {
            id,
            text: option?.text ?? ""
          };
        }),
        correctOptionId: question.correctOptionId,
        explanation: question.explanation
      }))
    };

    const parsed = questionPackSchema.parse(pack);
    const defaultOutput = path.join("content", "imported", `${parsed.id}.json`);
    const outputPath = path.resolve(
      await askWithDefault(rl, "Archivo de salida", defaultOutput)
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    console.log(`\nJSON guardado en ${outputPath}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
