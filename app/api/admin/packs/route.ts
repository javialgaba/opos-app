import { NextResponse } from "next/server";
import { loadQuestionPacks } from "@/lib/content/loader";
import { questionPackSchema } from "@/lib/content/schema";
import { assertSafeContentPath, saveContentFile } from "@/lib/admin/github";
import { upsertQuestionPackToSupabase } from "@/lib/content/supabase-store";

function requireAdmin(request: Request) {
  const expected = process.env.ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!expected) {
    throw new Error("ADMIN_SECRET no está configurado.");
  }

  if (provided !== expected) {
    const error = new Error("Clave de administración incorrecta.");
    error.name = "Unauthorized";
    throw error;
  }
}

function serializeJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const packs = await loadQuestionPacks();
    return NextResponse.json({ packs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los packs." },
      { status: error instanceof Error && error.name === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = (await request.json()) as {
      filePath?: string;
      pack?: unknown;
    };

    if (!body.filePath) {
      return NextResponse.json({ error: "Falta la ruta del archivo." }, { status: 400 });
    }

    const filePath = assertSafeContentPath(body.filePath);
    const pack = questionPackSchema.parse(body.pack);
    const result = await saveContentFile(filePath, serializeJson(pack));
    const contentSync = await upsertQuestionPackToSupabase(pack, filePath);

    return NextResponse.json({
      ok: true,
      result,
      contentSync
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el pack." },
      { status: error instanceof Error && error.name === "Unauthorized" ? 401 : 400 }
    );
  }
}
