import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function cleanupUpload(supabase: SupabaseClient<Database>, id: string, paths: string[], adminId?: string) {
  // Kunci sesi menserialkan pembatalan dengan finalisasi di database.
  const { data, error } = await supabase.rpc("batalkan_unggahan", { p_id: id, p_admin: adminId ?? null });
  if (error) throw new Error("Status unggahan belum dapat diperiksa.");
  if (!data) return false;
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from("berkas").remove(paths);
    if (removeError) throw new Error("Berkas sementara belum dapat dibersihkan.");
  }
  return true;
}
