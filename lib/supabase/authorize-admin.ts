import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthenticatedAdminId() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;
  const { data: admin, error: adminError } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (adminError || !admin) return null;
  return user.id;
}
