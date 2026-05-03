import { asSupabaseError, getServerSupabaseClient } from "../supabase/server";
import { questionPackSchema, type LoadedPack, type QuestionPack } from "./schema";

type QuestionPackRow = {
  id: string;
  source_path: string | null;
  pack: unknown;
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const details = error as { code?: string; message?: string };

  return details.code === "42P01" || /question_packs|schema cache/i.test(details.message ?? "");
}

export async function loadQuestionPacksFromSupabase(): Promise<LoadedPack[] | null> {
  const supabase = getServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("question_packs")
    .select("id, source_path, pack")
    .order("id", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }

    throw asSupabaseError(error, "No se pudieron cargar las preguntas desde Supabase.");
  }

  return ((data ?? []) as QuestionPackRow[]).map((row) => ({
    ...questionPackSchema.parse(row.pack),
    sourcePath: row.source_path ?? `supabase:${row.id}`
  }));
}

export async function upsertQuestionPackToSupabase(pack: QuestionPack, sourcePath: string) {
  const supabase = getServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { error } = await supabase.from("question_packs").upsert(
    {
      id: pack.id,
      source_path: sourcePath,
      pack,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Falta la tabla public.question_packs en Supabase. Ejecuta supabase/schema.sql en el SQL editor y vuelve a lanzar npm run sync:content:supabase."
      );
    }

    throw asSupabaseError(error, "No se pudo sincronizar el pack con Supabase.");
  }

  return {
    mode: "supabase",
    table: "question_packs"
  };
}
