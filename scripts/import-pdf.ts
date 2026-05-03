import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildDefaultPackOptions,
  buildQuestionPackFromPages,
  createQuestionPack,
  parseQuestionsFromPages,
  type BuildPackOptions,
  type ImporterQuestion
} from "../lib/pdf-importer/pack";
import { extractPdfPages } from "../lib/pdf-importer/pdf";
import { OPTION_IDS, type OptionId, slugify } from "../lib/pdf-importer/text";

type CliOptions = {
  pdfPath?: string;
  noWizard: boolean;
  dedupe?: boolean;
  failOnMissingAnswer?: boolean;
  selectedModels?: string[];
  oppositionName?: string;
  oppositionId?: string;
  packTitle?: string;
  packId?: string;
  topicName?: string;
  topicId?: string;
  wrongScore?: number;
  outputPath?: string;
};

function printHelp() {
  console.log(`
Uso:
  npm run import:pdf -- <pdf> [opciones]

Opciones:
  --no-wizard              Genera JSON sin revisar pregunta por pregunta.
  --auto, --yes, -y        Alias de --no-wizard.
  --models all|1,2,3       Modelos a importar. Por defecto: all.
  --dedupe                 Unifica duplicados. Por defecto: activado.
  --no-dedupe              Conserva cada modelo por separado.
  --fail-on-missing-answer Falla si falta una respuesta. Por defecto en --no-wizard.
  --allow-missing-answer   Permite respuestas no detectadas en wizard.
  --opposition <nombre>    Nombre de la oposición.
  --opposition-id <id>     ID de la oposición.
  --title <titulo>         Título del pack.
  --pack-id <id>           ID del pack.
  --topic <nombre>         Tema por defecto.
  --topic-id <id>          ID del tema por defecto.
  --wrong <numero>         Penalización por fallo. Por defecto: -0.33.
  --output <ruta>          Archivo JSON de salida.
  --help                   Muestra esta ayuda.
`);
}

function readFlagValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Falta valor para ${flag}.`);
  }

  return value;
}

function parseModels(value: string) {
  if (value.trim().toLowerCase() === "all") {
    return undefined;
  }

  const models = value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  if (!models.length) {
    throw new Error("--models debe ser all o una lista como 1,2,3.");
  }

  return models;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    noWizard: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--no-wizard" || arg === "--auto" || arg === "--yes" || arg === "-y") {
      options.noWizard = true;
      continue;
    }

    if (arg === "--dedupe") {
      options.dedupe = true;
      continue;
    }

    if (arg === "--no-dedupe") {
      options.dedupe = false;
      continue;
    }

    if (arg === "--fail-on-missing-answer") {
      options.failOnMissingAnswer = true;
      continue;
    }

    if (arg === "--allow-missing-answer") {
      options.failOnMissingAnswer = false;
      continue;
    }

    if (arg === "--models") {
      options.selectedModels = parseModels(readFlagValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--opposition") {
      options.oppositionName = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--opposition-id") {
      options.oppositionId = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--title") {
      options.packTitle = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--pack-id") {
      options.packId = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--topic") {
      options.topicName = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--topic-id") {
      options.topicId = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--wrong") {
      const value = Number(readFlagValue(args, index, arg));

      if (!Number.isFinite(value)) {
        throw new Error("--wrong debe ser un número.");
      }

      options.wrongScore = value;
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      options.outputPath = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Opción desconocida: ${arg}`);
    }

    if (options.pdfPath) {
      throw new Error(`Solo se admite un PDF de entrada. Valor inesperado: ${arg}`);
    }

    options.pdfPath = arg;
  }

  return options;
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: string
) {
  const answer = await rl.question(`${label}${defaultValue ? ` [${defaultValue}]` : ""}: `);
  return answer.trim() || defaultValue;
}

function normalizeCliOptionId(value: string, fallback: OptionId): OptionId {
  const upper = value.trim().toUpperCase();

  if (OPTION_IDS.includes(upper as OptionId)) {
    return upper as OptionId;
  }

  return fallback;
}

async function reviewQuestion(
  rl: ReturnType<typeof createInterface>,
  question: ImporterQuestion,
  index: number,
  total: number
): Promise<ImporterQuestion | null> {
  console.log("\n────────────────────────────────────────");
  console.log(
    `Pregunta candidata ${index + 1}/${total} · Modelo ${question.modelId} · ${question.questionNumber}`
  );
  console.log(question.prompt);
  for (const option of question.options) {
    console.log(`${option.id}) ${option.text}`);
  }
  console.log(`Correcta detectada: ${question.correctOptionId}`);

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

  const reviewed: ImporterQuestion = { ...question, options: [...question.options] };

  if (action === "e") {
    reviewed.prompt = await askWithDefault(rl, "Enunciado", reviewed.prompt);
    reviewed.options = [];

    for (const id of OPTION_IDS) {
      const existing = question.options.find((option) => option.id === id)?.text ?? "";
      reviewed.options.push({
        id,
        text: await askWithDefault(rl, `Opción ${id}`, existing)
      });
    }
  }

  reviewed.correctOptionId = normalizeCliOptionId(
    await askWithDefault(rl, "Respuesta correcta (A/B/C/D)", reviewed.correctOptionId),
    reviewed.correctOptionId
  );
  reviewed.explanation = await askWithDefault(rl, "Explicación opcional", "");

  return reviewed;
}

async function resolvePackOptions(
  rl: ReturnType<typeof createInterface>,
  options: CliOptions,
  defaultBaseName: string
): Promise<BuildPackOptions> {
  const oppositionName =
    options.oppositionName ?? (await askWithDefault(rl, "Nombre de la oposición", "Oposición"));
  const oppositionId =
    options.oppositionId ??
    (await askWithDefault(rl, "ID de la oposición", slugify(oppositionName)));
  const packTitle =
    options.packTitle ?? (await askWithDefault(rl, "Título del pack", defaultBaseName));
  const packId = options.packId ?? (await askWithDefault(rl, "ID del pack", defaultBaseName));
  const topicName = options.topicName ?? (await askWithDefault(rl, "Tema por defecto", "General"));
  const topicId = options.topicId ?? (await askWithDefault(rl, "ID del tema", slugify(topicName)));
  const wrongScore =
    options.wrongScore ?? Number(await askWithDefault(rl, "Penalización por fallo", "-0.33"));

  return buildDefaultPackOptions({
    defaultBaseName,
    oppositionName,
    oppositionId,
    packTitle,
    packId,
    topicName,
    topicId,
    wrongScore,
    selectedModels: options.selectedModels,
    dedupe: options.dedupe ?? true,
    failOnMissingAnswer: options.failOnMissingAnswer ?? options.noWizard
  });
}

async function writePack(outputPath: string, pack: unknown) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  console.log(`JSON guardado en ${outputPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let rl: ReturnType<typeof createInterface> | null = null;

  try {
    if (!options.pdfPath && options.noWizard) {
      throw new Error("En modo --no-wizard debes indicar la ruta del PDF.");
    }

    const resolvedPdfPath = options.pdfPath
      ? path.resolve(options.pdfPath)
      : path.resolve(
          await (() => {
            rl = createInterface({ input, output });
            return rl.question("Ruta del PDF: ");
          })()
        );
    const defaultBaseName = slugify(path.basename(resolvedPdfPath, path.extname(resolvedPdfPath)));

    rl?.close();
    rl = null;

    console.log(`Leyendo ${resolvedPdfPath}...`);
    const pages = await extractPdfPages(resolvedPdfPath);
    console.log(`Páginas leídas: ${pages.length}`);

    if (options.noWizard) {
      const packOptions = buildDefaultPackOptions({
        defaultBaseName,
        oppositionName: options.oppositionName,
        oppositionId: options.oppositionId,
        packTitle: options.packTitle,
        packId: options.packId,
        topicName: options.topicName,
        topicId: options.topicId,
        wrongScore: options.wrongScore,
        selectedModels: options.selectedModels,
        dedupe: options.dedupe ?? true,
        failOnMissingAnswer: options.failOnMissingAnswer ?? true
      });
      const pack = buildQuestionPackFromPages(pages, packOptions);
      const outputPath = path.resolve(
        options.outputPath ?? path.join("content", "imported", `${pack.id}.json`)
      );

      await writePack(outputPath, pack);
      console.log(`Preguntas exportadas: ${pack.questions.length}`);
      return;
    }

    rl = createInterface({ input, output });
    const packOptions = await resolvePackOptions(rl, options, defaultBaseName);
    const parsedQuestions = parseQuestionsFromPages(pages, {
      selectedModels: options.selectedModels,
      failOnMissingAnswer: options.failOnMissingAnswer ?? false
    });
    const accepted: ImporterQuestion[] = [];

    for (let index = 0; index < parsedQuestions.length; index += 1) {
      const reviewed = await reviewQuestion(rl, parsedQuestions[index], index, parsedQuestions.length);

      if (reviewed) {
        accepted.push(reviewed);
      }
    }

    if (!accepted.length) {
      throw new Error("No se aceptó ninguna pregunta.");
    }

    const pack = createQuestionPack(accepted, packOptions);
    const defaultOutput = path.join("content", "imported", `${pack.id}.json`);
    const outputPath = path.resolve(
      options.outputPath ?? (await askWithDefault(rl, "Archivo de salida", defaultOutput))
    );

    await writePack(outputPath, pack);
  } finally {
    rl?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
