import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null | undefined;

function decodeJwtPayload(key: string) {
  const parts = key.split(".");

  if (parts.length < 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: string;
    };
  } catch {
    return null;
  }
}

function assertServerSupabaseKey(key: string) {
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY contiene una publishable/anon key. Copia la service_role secret key de Supabase Settings > API y reinicia Next."
    );
  }

  const payload = decodeJwtPayload(key);

  if (payload?.role && payload.role !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY tiene rol "${payload.role}", pero la app necesita "service_role" para escribir con RLS activo.`
    );
  }
}

export function asSupabaseError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const details = error as {
      code?: string;
      details?: string | null;
      message?: string;
    };
    const code = details.code ? ` [${details.code}]` : "";
    const extra = details.details ? ` ${details.details}` : "";

    return new Error(`${details.message ?? fallback}${code}.${extra}`.trim());
  }

  return new Error(fallback);
}

export function getServerSupabaseClient() {
  if (supabaseClient !== undefined) {
    return supabaseClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    supabaseClient = null;
    return supabaseClient;
  }

  assertServerSupabaseKey(serviceKey);

  supabaseClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false
    }
  });

  return supabaseClient;
}
