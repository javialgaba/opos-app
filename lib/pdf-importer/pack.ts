import { questionPackSchema, type QuestionPack } from "../content/schema";
import {
  OPTION_IDS,
  type OptionId,
  type ParsedQuestion,
  type PdfPageText,
  normalizeQuestionNumber,
  normalizeText,
  parseAnswerKeyFromPages,
  parseQuestionsFromText,
  segmentModelSections,
  slugify
} from "./text";

export type QuestionSource = {
  modelId: string;
  questionNumber: string;
};

export type ImporterQuestion = ParsedQuestion & {
  correctOptionId: OptionId;
  explanation?: string;
  sources?: QuestionSource[];
};

export type BuildPackOptions = {
  oppositionId: string;
  oppositionName: string;
  packId: string;
  packTitle: string;
  topicId: string;
  topicName: string;
  wrongScore: number;
  selectedModels?: string[];
  dedupe: boolean;
  failOnMissingAnswer: boolean;
};

function selectedModelSet(models?: string[]) {
  if (!models?.length) {
    return null;
  }

  return new Set(models.map((model) => model.trim()).filter(Boolean));
}

export function parseQuestionsFromPages(
  pages: PdfPageText[],
  options: Pick<BuildPackOptions, "selectedModels" | "failOnMissingAnswer">
) {
  const selectedModels = selectedModelSet(options.selectedModels);
  const sections = segmentModelSections(pages);

  if (!sections.length) {
    const text = pages.map((page) => page.text).join("\n");
    const answers = parseAnswerKeyFromPages(pages);
    const questions = parseQuestionsFromText(text, "default");

    return questions.map((question) => applyAnswer(question, answers, options.failOnMissingAnswer));
  }

  return sections
    .filter((section) => !selectedModels || selectedModels.has(section.modelId))
    .flatMap((section) => {
      const answers = parseAnswerKeyFromPages(section.answerPages);
      const questionText = section.questionPages.map((page) => page.text).join("\n");
      return parseQuestionsFromText(questionText, section.modelId).map((question) =>
        applyAnswer(question, answers, options.failOnMissingAnswer)
      );
    });
}

function applyAnswer(
  question: ParsedQuestion,
  answers: Map<string, OptionId>,
  failOnMissingAnswer: boolean
): ImporterQuestion {
  const answer = answers.get(normalizeQuestionNumber(question.questionNumber));

  if (!answer && failOnMissingAnswer) {
    throw new Error(
      `Falta respuesta para modelo ${question.modelId}, pregunta ${question.questionNumber}.`
    );
  }

  if (!answer) {
    return {
      ...question,
      correctOptionId: "A"
    };
  }

  return {
    ...question,
    correctOptionId: answer
  };
}

function dedupeKey(question: ImporterQuestion) {
  const prompt = normalizeText(question.prompt);
  const options = question.options.map((option) => normalizeText(option.text)).sort().join("|");
  return `${prompt}::${options}`;
}

function correctOptionText(question: ImporterQuestion) {
  const option = question.options.find((item) => item.id === question.correctOptionId);

  if (!option) {
    throw new Error(
      `Respuesta inválida para modelo ${question.modelId}, pregunta ${question.questionNumber}.`
    );
  }

  return normalizeText(option.text);
}

export function dedupeQuestions(questions: ImporterQuestion[]) {
  const groups = new Map<string, ImporterQuestion[]>();

  for (const question of questions) {
    const key = dedupeKey(question);
    const group = groups.get(key) ?? [];
    group.push(question);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const canonical = group[0];
    const canonicalCorrectText = correctOptionText(canonical);
    const canonicalCorrectOption = canonical.options.find(
      (option) => normalizeText(option.text) === canonicalCorrectText
    );

    if (!canonicalCorrectOption) {
      throw new Error(`No se pudo resolver la respuesta canónica: ${canonical.prompt}`);
    }

    for (const duplicate of group.slice(1)) {
      const duplicateCorrectText = correctOptionText(duplicate);
      const mappedOption = canonical.options.find(
        (option) => normalizeText(option.text) === duplicateCorrectText
      );

      if (!mappedOption) {
        throw new Error(
          `Conflicto al deduplicar "${canonical.prompt}": no se encontró el texto correcto del modelo ${duplicate.modelId}.`
        );
      }

      if (mappedOption.id !== canonicalCorrectOption.id) {
        throw new Error(
          `Conflicto de respuesta al deduplicar "${canonical.prompt}": modelos ${canonical.modelId} y ${duplicate.modelId}.`
        );
      }
    }

    return {
      ...canonical,
      correctOptionId: canonicalCorrectOption.id,
      sources: group.map((question) => ({
        modelId: question.modelId,
        questionNumber: question.questionNumber
      }))
    };
  });
}

export function createQuestionPack(questions: ImporterQuestion[], options: BuildPackOptions) {
  const importedQuestions = options.dedupe ? dedupeQuestions(questions) : questions;
  const topics = [{ id: options.topicId, name: options.topicName }];
  const pack: QuestionPack = {
    formatVersion: 1,
    id: options.packId,
    opposition: {
      id: options.oppositionId,
      name: options.oppositionName
    },
    title: options.packTitle,
    scoring: {
      correct: 1,
      wrong: Number.isFinite(options.wrongScore) ? options.wrongScore : -0.33,
      blank: 0
    },
    topics,
    questions: importedQuestions.map((question, index) => ({
      id: `${options.packId}-${String(index + 1).padStart(3, "0")}`,
      topicId: options.topicId,
      prompt: question.prompt,
      options: OPTION_IDS.map((id) => {
        const option = question.options.find((item) => item.id === id);
        return {
          id,
          text: option?.text ?? ""
        };
      }),
      correctOptionId: question.correctOptionId,
      explanation: question.explanation ?? "",
      sources: question.sources ?? [
        { modelId: question.modelId, questionNumber: question.questionNumber }
      ]
    }))
  };

  return questionPackSchema.parse(pack);
}

export function buildQuestionPackFromPages(pages: PdfPageText[], options: BuildPackOptions) {
  const questions = parseQuestionsFromPages(pages, options);

  if (!questions.length) {
    throw new Error("No se detectaron preguntas con 4 opciones.");
  }

  return createQuestionPack(questions, options);
}

export function buildDefaultPackOptions({
  defaultBaseName,
  oppositionName,
  oppositionId,
  packTitle,
  packId,
  topicName,
  topicId,
  wrongScore,
  selectedModels,
  dedupe,
  failOnMissingAnswer
}: {
  defaultBaseName: string;
  oppositionName?: string;
  oppositionId?: string;
  packTitle?: string;
  packId?: string;
  topicName?: string;
  topicId?: string;
  wrongScore?: number;
  selectedModels?: string[];
  dedupe: boolean;
  failOnMissingAnswer: boolean;
}): BuildPackOptions {
  const resolvedOppositionName = oppositionName ?? "Oposición";
  const resolvedTopicName = topicName ?? "General";

  return {
    oppositionName: resolvedOppositionName,
    oppositionId: slugify(oppositionId ?? resolvedOppositionName),
    packTitle: packTitle ?? defaultBaseName,
    packId: slugify(packId ?? defaultBaseName),
    topicName: resolvedTopicName,
    topicId: slugify(topicId ?? resolvedTopicName),
    wrongScore: wrongScore ?? -0.33,
    selectedModels,
    dedupe,
    failOnMissingAnswer
  };
}
