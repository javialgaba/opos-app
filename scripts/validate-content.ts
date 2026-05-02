import { loadQuestionBank } from "../lib/content/loader";

try {
  const bank = await loadQuestionBank();
  console.log(
    `Contenido válido: ${bank.packs.length} packs, ${bank.questions.length} preguntas.`
  );
} catch (error) {
  console.error("El contenido no es válido.");
  console.error(error);
  process.exitCode = 1;
}
