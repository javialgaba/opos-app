import { z } from "zod";

export const slugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use minúsculas, números y guiones.");

export const optionSchema = z.object({
  id: z.string().min(1).max(12),
  text: z.string().trim().min(1)
});

export const topicSchema = z.object({
  id: slugSchema,
  name: z.string().trim().min(1)
});

export const scoringSchema = z.object({
  correct: z.number(),
  wrong: z.number(),
  blank: z.number()
});

export const questionSchema = z
  .object({
    id: slugSchema,
    topicId: slugSchema,
    prompt: z.string().trim().min(1),
    options: z.array(optionSchema).length(4, "Cada pregunta debe tener 4 opciones."),
    correctOptionId: z.string().min(1),
    explanation: z.string().trim().optional().default(""),
    sources: z
      .array(
        z.object({
          modelId: z.string().trim().min(1),
          questionNumber: z.string().trim().min(1)
        })
      )
      .optional()
  })
  .superRefine((question, ctx) => {
    const optionIds = new Set(question.options.map((option) => option.id));

    if (optionIds.size !== question.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Las opciones de una pregunta deben tener IDs únicos.",
        path: ["options"]
      });
    }

    if (!optionIds.has(question.correctOptionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La respuesta correcta debe coincidir con una de las opciones.",
        path: ["correctOptionId"]
      });
    }
  });

export const questionPackSchema = z
  .object({
    formatVersion: z.literal(1),
    id: slugSchema,
    opposition: z.object({
      id: slugSchema,
      name: z.string().trim().min(1)
    }),
    title: z.string().trim().min(1),
    scoring: scoringSchema,
    topics: z.array(topicSchema).min(1),
    questions: z.array(questionSchema).min(1)
  })
  .superRefine((pack, ctx) => {
    const topicIds = new Set(pack.topics.map((topic) => topic.id));
    const questionIds = new Set<string>();

    pack.questions.forEach((question, index) => {
      if (!topicIds.has(question.topicId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La pregunta referencia un tema inexistente.",
          path: ["questions", index, "topicId"]
        });
      }

      if (questionIds.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Los IDs de pregunta deben ser únicos dentro del pack.",
          path: ["questions", index, "id"]
        });
      }

      questionIds.add(question.id);
    });
  });

export type QuestionPack = z.infer<typeof questionPackSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionOption = z.infer<typeof optionSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Scoring = z.infer<typeof scoringSchema>;

export type LoadedQuestion = Question & {
  questionKey: string;
  packId: string;
  sourcePath: string;
  oppositionId: string;
  oppositionName: string;
  topicName: string;
  scoring: Scoring;
};

export type LoadedPack = QuestionPack & {
  sourcePath: string;
};

export type PublicQuestion = {
  id: string;
  packId: string;
  oppositionId: string;
  oppositionName: string;
  topicId: string;
  topicName: string;
  prompt: string;
  options: QuestionOption[];
};

export function sanitizeQuestion(question: LoadedQuestion): PublicQuestion {
  return {
    id: question.questionKey,
    packId: question.packId,
    oppositionId: question.oppositionId,
    oppositionName: question.oppositionName,
    topicId: question.topicId,
    topicName: question.topicName,
    prompt: question.prompt,
    options: question.options
  };
}

export function scoreAnswer(
  scoring: Scoring,
  selectedOptionId: string | null,
  correctOptionId: string
) {
  if (!selectedOptionId) {
    return {
      isCorrect: false,
      score: scoring.blank
    };
  }

  const isCorrect = selectedOptionId === correctOptionId;

  return {
    isCorrect,
    score: isCorrect ? scoring.correct : scoring.wrong
  };
}
