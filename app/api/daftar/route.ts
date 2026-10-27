import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyRegistrationTicket } from "@/lib/registration-ticket";
import { cleanupUpload } from "@/lib/upload-session";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
const requestSchema = z.object({ ticket: z.string().min(1).max(8192), cleanup: z.boolean().default(false) }).strict();

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tiket pendaftaran tidak valid." }, { status: 400 });
  try {
    const payload = verifyRegistrationTicket(parsed.data.ticket);
    if (!payload) return Response.json({ error: "Tiket tidak valid atau kedaluwarsa. Silakan mulai kembali." }, { status: 400 });
    const supabase = createSupabaseAdminClient();
    if (parsed.data.cleanup) {
      const cleaned = await cleanupUpload(supabase, payload.applicantId, Object.values(payload.files));
      return Response.json(cleaned ? { cleaned: true } : { error: "Berkas pendaftaran yang sudah disimpan tidak dapat dibersihkan." }, { status: cleaned ? 200 : 409 });
    }
    const { data, error } = await supabase.rpc("simpan_pendaftaran", { p_id: payload.applicantId });
    if (error) {
      console.error("Finalisasi pendaftaran gagal.", { code: error.code });
      return Response.json({ error: "Pendaftaran belum dapat disimpan. Coba kirim kembali." }, { status: 503 });
    }
    const result = z.object({ id: z.uuid(), alreadySaved: z.boolean() }).safeParse(data);
    if (result.success) return Response.json({ id: result.data.id }, { status: result.data.alreadySaved ? 200 : 201 });
    const failure = z.object({ error: z.string() }).safeParse(data);
    const duplicate = failure.success && failure.data.error === "pendaftaran_duplikat";
    return Response.json({ error: duplicate ? "NIM ini sudah terdaftar pada tanggal mulai dan penempatan tersebut." : "Tiket atau unggahan tidak valid. Periksa berkas dan coba kembali." }, { status: duplicate ? 409 : 400 });
  } catch {
    return Response.json({ error: "Layanan pendaftaran belum tersedia." }, { status: 503 });
  }
}
