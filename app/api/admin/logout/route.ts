import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Login page remains available even before Supabase is configured.
  }
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
