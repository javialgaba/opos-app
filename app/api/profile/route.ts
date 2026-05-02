import { NextResponse } from "next/server";
import { getOrCreateProfile } from "@/lib/progress/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { alias?: string };
    const profile = await getOrCreateProfile(body.alias ?? "");
    const response = NextResponse.json({ profile });

    response.cookies.set("opos_profile_id", profile.id, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      path: "/"
    });
    response.cookies.set("opos_alias", profile.alias, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      path: "/"
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el perfil." },
      { status: 400 }
    );
  }
}
