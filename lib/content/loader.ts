import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type LoadedPack,
  type LoadedQuestion,
  type PublicQuestion,
  questionPackSchema,
  sanitizeQuestion
} from "./schema";

const CONTENT_DIRECTORIES = ["content/oppositions", "content/imported"];

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const absoluteDirectory = path.join(process.cwd(), directory);

  if (!(await pathExists(absoluteDirectory))) {
    return [];
  }

  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listJsonFiles(relativePath);
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        return [relativePath];
      }

      return [];
    })
  );

  return nested.flat().sort();
}

export async function loadQuestionPacks(): Promise<LoadedPack[]> {
  const files = (await Promise.all(CONTENT_DIRECTORIES.map(listJsonFiles))).flat();
  const packs = await Promise.all(
    files.map(async (sourcePath) => {
      const raw = await fs.readFile(path.join(process.cwd(), sourcePath), "utf8");
      const parsed = questionPackSchema.parse(JSON.parse(raw));
      return {
        ...parsed,
        sourcePath
      };
    })
  );

  const packIds = new Set<string>();

  for (const pack of packs) {
    if (packIds.has(pack.id)) {
      throw new Error(`Pack duplicado: ${pack.id}`);
    }

    packIds.add(pack.id);
  }

  return packs;
}

export async function loadQuestionBank() {
  const packs = await loadQuestionPacks();
  const questions: LoadedQuestion[] = packs.flatMap((pack) => {
    const topicsById = new Map(pack.topics.map((topic) => [topic.id, topic]));

    return pack.questions.map((question) => {
      const topic = topicsById.get(question.topicId);

      if (!topic) {
        throw new Error(`Tema no encontrado: ${question.topicId}`);
      }

      return {
        ...question,
        questionKey: `${pack.id}:${question.id}`,
        packId: pack.id,
        sourcePath: pack.sourcePath,
        oppositionId: pack.opposition.id,
        oppositionName: pack.opposition.name,
        topicName: topic.name,
        scoring: pack.scoring
      };
    });
  });

  return {
    packs,
    questions
  };
}

export async function loadPublicQuestions(): Promise<PublicQuestion[]> {
  const bank = await loadQuestionBank();
  return bank.questions.map(sanitizeQuestion);
}

export async function findQuestion(questionKey: string) {
  const bank = await loadQuestionBank();
  return bank.questions.find((question) => question.questionKey === questionKey) ?? null;
}
