import nextEnv from "@next/env";
import { loadQuestionPacksFromFiles } from "../lib/content/loader";
import { upsertQuestionPackToSupabase } from "../lib/content/supabase-store";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

try {
  const packs = await loadQuestionPacksFromFiles();
  let questionCount = 0;

  if (!packs.length) {
    throw new Error("No hay packs JSON para sincronizar.");
  }

  for (const pack of packs) {
    const result = await upsertQuestionPackToSupabase(pack, pack.sourcePath);

    if (!result) {
      throw new Error(
        "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas para sincronizar."
      );
    }

    questionCount += pack.questions.length;
    console.log(`Sincronizado ${pack.id}: ${pack.questions.length} preguntas.`);
  }

  console.log(`Sincronización completa: ${packs.length} packs, ${questionCount} preguntas.`);
} catch (error) {
  console.error("No se pudo sincronizar el contenido con Supabase.");
  console.error(error);
  process.exitCode = 1;
}
