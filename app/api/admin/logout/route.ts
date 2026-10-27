import { hasValidOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Login page remains available even before Supabase is configured.
  }
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
