import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StudyMode = "practice" | "exam";

export type Profile = {
  id: string;
  alias: string;
  createdAt: string;
};

export type AttemptRecord = {
  id: string;
  profileId: string;
  questionKey: string;
  oppositionId: string;
  topicId: string;
  mode: StudyMode;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  score: number;
  createdAt: string;
};

export type ExamSessionInput = {
  profileId: string;
  oppositionId: string;
  topicId: string | null;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
};

type SupabaseAttemptRow = {
  id: string;
  profile_id: string;
  question_key: string;
  opposition_id: string;
  topic_id: string;
  mode: StudyMode;
  selected_option_id: string | null;
  correct_option_id: string;
  is_correct: boolean;
  score: number;
  created_at: string;
};

type MemoryState = {
  profiles: Profile[];
  attempts: AttemptRecord[];
  examSessions: Array<ExamSessionInput & { id: string; createdAt: string }>;
};

declare global {
  var __oposMemoryState: MemoryState | undefined;
}

const memoryState: MemoryState =
  globalThis.__oposMemoryState ??
  (globalThis.__oposMemoryState = {
    profiles: [],
    attempts: [],
    examSessions: []
  });

let supabaseClient: SupabaseClient | null | undefined;

function getSupabaseClient() {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  supabaseClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false
    }
  });

  return supabaseClient;
}

export function normalizeAlias(alias: string) {
  return alias.trim().replace(/\s+/g, " ").slice(0, 64);
}

function mapAttempt(row: SupabaseAttemptRow): AttemptRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    questionKey: row.question_key,
    oppositionId: row.opposition_id,
    topicId: row.topic_id,
    mode: row.mode,
    selectedOptionId: row.selected_option_id,
    correctOptionId: row.correct_option_id,
    isCorrect: row.is_correct,
    score: Number(row.score),
    createdAt: row.created_at
  };
}

export async function getOrCreateProfile(aliasInput: string): Promise<Profile> {
  const alias = normalizeAlias(aliasInput);

  if (!alias) {
    throw new Error("El alias no puede estar vacío.");
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    const existing = memoryState.profiles.find(
      (profile) => profile.alias.toLocaleLowerCase() === alias.toLocaleLowerCase()
    );

    if (existing) {
      return existing;
    }

    const profile = {
      id: crypto.randomUUID(),
      alias,
      createdAt: new Date().toISOString()
    };

    memoryState.profiles.push(profile);
    return profile;
  }

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id, alias, created_at")
    .ilike("alias", alias)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return {
      id: existing.id,
      alias: existing.alias,
      createdAt: existing.created_at
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ alias })
    .select("id, alias, created_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    alias: data.alias,
    createdAt: data.created_at
  };
}

export async function recordAttempt(
  attempt: Omit<AttemptRecord, "id" | "createdAt">
) {
  const supabase = getSupabaseClient();
  const createdAt = new Date().toISOString();

  if (!supabase) {
    const record = {
      ...attempt,
      id: crypto.randomUUID(),
      createdAt
    };

    memoryState.attempts.push(record);
    return record;
  }

  const { data, error } = await supabase
    .from("attempts")
    .insert({
      profile_id: attempt.profileId,
      question_key: attempt.questionKey,
      opposition_id: attempt.oppositionId,
      topic_id: attempt.topicId,
      mode: attempt.mode,
      selected_option_id: attempt.selectedOptionId,
      correct_option_id: attempt.correctOptionId,
      is_correct: attempt.isCorrect,
      score: attempt.score
    })
    .select(
      "id, profile_id, question_key, opposition_id, topic_id, mode, selected_option_id, correct_option_id, is_correct, score, created_at"
    )
    .single();

  if (error) {
    throw error;
  }

  return mapAttempt(data);
}

export async function recordExamSession(session: ExamSessionInput) {
  const supabase = getSupabaseClient();
  const createdAt = new Date().toISOString();

  if (!supabase) {
    memoryState.examSessions.push({
      ...session,
      id: crypto.randomUUID(),
      createdAt
    });
    return;
  }

  const { error } = await supabase.from("exam_sessions").insert({
    profile_id: session.profileId,
    opposition_id: session.oppositionId,
    topic_id: session.topicId,
    total: session.total,
    correct: session.correct,
    wrong: session.wrong,
    blank: session.blank,
    score: session.score
  });

  if (error) {
    throw error;
  }
}

export async function listAttempts(profileId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return memoryState.attempts.filter((attempt) => attempt.profileId === profileId);
  }

  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, profile_id, question_key, opposition_id, topic_id, mode, selected_option_id, correct_option_id, is_correct, score, created_at"
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapAttempt);
}

export async function getQuestionStats(profileId: string) {
  const attempts = await listAttempts(profileId);
  const stats = new Map<
    string,
    {
      attempts: number;
      correct: number;
      lastAttemptAt: string;
    }
  >();

  for (const attempt of attempts) {
    const current = stats.get(attempt.questionKey);
    stats.set(attempt.questionKey, {
      attempts: (current?.attempts ?? 0) + 1,
      correct: (current?.correct ?? 0) + (attempt.isCorrect ? 1 : 0),
      lastAttemptAt:
        current && current.lastAttemptAt > attempt.createdAt
          ? current.lastAttemptAt
          : attempt.createdAt
    });
  }

  return Object.fromEntries(stats);
}

export async function getProgress(profileId: string) {
  const attempts = await listAttempts(profileId);
  const byOpposition = new Map<
    string,
    {
      oppositionId: string;
      attempts: number;
      correct: number;
      score: number;
    }
  >();
  const byTopic = new Map<
    string,
    {
      oppositionId: string;
      topicId: string;
      attempts: number;
      correct: number;
      score: number;
    }
  >();

  for (const attempt of attempts) {
    const opposition = byOpposition.get(attempt.oppositionId) ?? {
      oppositionId: attempt.oppositionId,
      attempts: 0,
      correct: 0,
      score: 0
    };

    opposition.attempts += 1;
    opposition.correct += attempt.isCorrect ? 1 : 0;
    opposition.score += attempt.score;
    byOpposition.set(attempt.oppositionId, opposition);

    const topicKey = `${attempt.oppositionId}:${attempt.topicId}`;
    const topic = byTopic.get(topicKey) ?? {
      oppositionId: attempt.oppositionId,
      topicId: attempt.topicId,
      attempts: 0,
      correct: 0,
      score: 0
    };

    topic.attempts += 1;
    topic.correct += attempt.isCorrect ? 1 : 0;
    topic.score += attempt.score;
    byTopic.set(topicKey, topic);
  }

  return {
    totalAttempts: attempts.length,
    byOpposition: Array.from(byOpposition.values()),
    byTopic: Array.from(byTopic.values())
  };
}
