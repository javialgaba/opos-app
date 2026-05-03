export const OPTION_IDS = ["A", "B", "C", "D"] as const;

export type OptionId = (typeof OPTION_IDS)[number];

export type PdfPageText = {
  pageNumber: number;
  text: string;
};

export type CandidateOption = {
  id: OptionId;
  text: string;
};

export type ParsedQuestion = {
  modelId: string;
  questionNumber: string;
  prompt: string;
  options: CandidateOption[];
  correctOptionId: OptionId | null;
};

export type ModelSection = {
  modelId: string;
  questionPages: PdfPageText[];
  answerPages: PdfPageText[];
};

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function normalizeOptionId(value: string): OptionId | null {
  const upper = value.trim().toUpperCase();
  const numeric: Record<string, OptionId> = {
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "D"
  };
  const normalized = numeric[upper] ?? upper;

  return OPTION_IDS.includes(normalized as OptionId) ? (normalized as OptionId) : null;
}

export function normalizeQuestionNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”«»"'.:;,¿?¡!()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFooter(text: string) {
  return text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/C[oó]d\.\s*Validaci[oó]n|Verificaci[oó]n:|Documento firmado/i.test(line)
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeader(text: string) {
  const cleaned = text.trim();
  const match = cleaned.match(/^MODELO\s+(\d+)\b(?:\s+(RESPUESTAS?|PLANTILLA|SOLUCIONES?))?/i);

  if (!match) {
    return null;
  }

  return {
    modelId: match[1],
    isAnswerPage: Boolean(match[2])
  };
}

export function segmentModelSections(pages: PdfPageText[]): ModelSection[] {
  const sections = new Map<string, ModelSection>();
  let current: { modelId: string; type: "questions" | "answers" } | null = null;

  for (const page of pages) {
    const header = getHeader(page.text);

    if (header) {
      const section =
        sections.get(header.modelId) ??
        {
          modelId: header.modelId,
          questionPages: [],
          answerPages: []
        };
      sections.set(header.modelId, section);
      current = {
        modelId: header.modelId,
        type: header.isAnswerPage ? "answers" : "questions"
      };
    }

    if (!current) {
      continue;
    }

    const section = sections.get(current.modelId);

    if (!section) {
      continue;
    }

    if (current.type === "answers") {
      section.answerPages.push(page);
    } else {
      section.questionPages.push(page);
    }
  }

  return Array.from(sections.values()).filter(
    (section) => section.questionPages.length > 0 || section.answerPages.length > 0
  );
}

export function parseAnswerKeyFromText(text: string) {
  const answers = new Map<string, OptionId>();
  const cleaned = cleanFooter(text);
  const matches = cleaned.matchAll(/(?:^|\s)((?:R\s*)?\d{1,3})\s+([A-Da-d1-4])(?=\s|$)/g);

  for (const match of matches) {
    const optionId = normalizeOptionId(match[2]);

    if (optionId) {
      answers.set(normalizeQuestionNumber(match[1]), optionId);
    }
  }

  return answers;
}

export function parseAnswerKeyFromPages(pages: PdfPageText[]) {
  return parseAnswerKeyFromText(pages.map((page) => cleanFooter(page.text)).join(" "));
}

function normalizeQuestionText(text: string) {
  return text
    .replace(/^\s*MODELO\s+\d+\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchOptionLine(line: string) {
  return (
    line.match(/^([A-Da-d])[\).:]\s*(.+)$/) ??
    line.match(/^([A-Da-d])\s*-\s*(.+)$/) ??
    line.match(/^([A-D])\s+([A-ZÁÉÍÓÚÜÑ¿¡0-9].+)$/)
  );
}

export function parseQuestionsFromText(text: string, modelId = "default"): ParsedQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeQuestionText(cleanFooter(line)))
    .filter(Boolean);
  const questions: ParsedQuestion[] = [];
  let current:
    | {
        questionNumber: string;
        promptParts: string[];
        options: CandidateOption[];
      }
    | null = null;

  function flush() {
    if (!current) {
      return;
    }

    const optionIds = new Set(current.options.map((option) => option.id));

    if (OPTION_IDS.every((id) => optionIds.has(id))) {
      questions.push({
        modelId,
        questionNumber: current.questionNumber,
        prompt: current.promptParts.join(" ").replace(/\s+/g, " ").trim(),
        options: OPTION_IDS.map((id) => current!.options.find((option) => option.id === id)!),
        correctOptionId: null
      });
    }

    current = null;
  }

  for (const line of lines) {
    const questionMatch = line.match(
      /^(?:pregunta\s*)?((?:R\s*)?\d{1,3})[\).\-\s]+(.+)$/i
    );
    const optionMatch = matchOptionLine(line);

    if (questionMatch && !optionMatch) {
      flush();
      current = {
        questionNumber: normalizeQuestionNumber(questionMatch[1]),
        promptParts: [questionMatch[2]],
        options: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (optionMatch && current.options.length < 4) {
      const optionId = normalizeOptionId(optionMatch[1]);

      if (optionId) {
        current.options.push({
          id: optionId,
          text: optionMatch[2].replace(/\s+/g, " ").trim()
        });
      }
      continue;
    }

    if (current.options.length === 0) {
      current.promptParts.push(line);
    } else if (current.options.length > 0 && current.options.length < 4) {
      const lastOption = current.options[current.options.length - 1];
      lastOption.text = `${lastOption.text} ${line}`.replace(/\s+/g, " ").trim();
    }
  }

  flush();

  return questions;
}
