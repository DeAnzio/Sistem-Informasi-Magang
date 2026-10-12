import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendDecisionEmail } from "@/lib/email";

const decisionSchema = z.discriminatedUnion("aksi", [
  z.object({ aksi: z.literal("terima") }),
  z.object({ aksi: z.literal("tolak"), catatan: z.string().trim().max(1000).default("") }),
]);

export async function POST(request: Request, context: RouteContext<"/api/verifikasi/[id]">) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Keputusan verifikasi tidak valid." }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = parsed.data.aksi === "terima"
      ? await supabase.rpc("terima_pendaftar", { p_id: id, p_admin: adminId })
      : await supabase.rpc("tolak_pendaftar", { p_id: id, p_admin: adminId, p_catatan: parsed.data.catatan });
    if (error) return Response.json({ error: "Keputusan belum dapat disimpan." }, { status: 500 });
    if (data !== "ok") {
      const message = data === "kuota_penuh" ? "Kuota sudah terpenuhi." : "Pendaftar sudah diproses.";
      return Response.json({ error: message, result: data }, { status: 409 });
    }
    const email = await sendDecisionEmail(id);
    return Response.json({ result: "ok", emailSent: email.sent });
  } catch {
    return Response.json({ error: "Layanan verifikasi belum dikonfigurasi." }, { status: 503 });
  }
}
