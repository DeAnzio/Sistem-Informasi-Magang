import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { cleanupUpload } from "../lib/upload-session";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Konfigurasi Supabase server belum lengkap.");
const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
// Signed upload URL berlaku 2 jam; tunggu 24 jam sebelum membersihkan objek.
// Sesi dibatalkan tetap dipertahankan agar cleanup berikutnya dapat mengulang
// kegagalan Storage dan menangkap unggahan terlambat. Jangan hapus tombstone.
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
let cursor: string | undefined;
let cleaned = 0;
do {
  let query = supabase.from("sesi_unggahan").select("id, admin_id, files")
    .in("status", ["siap", "dibatalkan"]).lt("created_at", cutoff).order("id").limit(100);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw new Error("Sesi unggahan tidak dapat dibaca.");
  if (!data?.length) break;
  for (const session of data) {
    const paths = typeof session.files === "object" && session.files !== null
      ? Object.values(session.files).filter((path): path is string => typeof path === "string") : [];
    if (await cleanupUpload(supabase, session.id, paths, session.admin_id ?? undefined)) cleaned++;
  }
  cursor = data.at(-1)?.id;
} while (cursor);
console.log(`${cleaned} sesi sementara dibersihkan.`);
