import { hasValidOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const quotaSchema = z.object({
  divisi_id: z.uuid(),
  kuota: z.coerce.number().int().min(0).max(500),
});

export async function PATCH(request: Request) {
  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });
  const parsed = quotaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Data kuota tidak valid." }, { status: 400 });
  try {
    const supabase = createSupabaseAdminClient();
    const { data: result, error } = await supabase.rpc("ubah_kuota_divisi", {
      p_divisi: parsed.data.divisi_id,
      p_kuota: parsed.data.kuota,
      p_admin: adminId,
    });
    if (error) return Response.json({ error: "Kuota belum dapat diperbarui." }, { status: 500 });
    if (result === "kuota_kurang_dari_terisi") {
      return Response.json({ error: "Kuota tidak boleh lebih kecil dari jumlah pemagang diterima yang aktif atau terjadwal." }, { status: 409 });
    }
    if (result !== "ok") return Response.json({ error: "Divisi tidak ditemukan." }, { status: 404 });
    return Response.json({ divisi_id: parsed.data.divisi_id, kuota: parsed.data.kuota });
  } catch {
    return Response.json({ error: "Layanan kuota belum dikonfigurasi." }, { status: 503 });
  }
}
