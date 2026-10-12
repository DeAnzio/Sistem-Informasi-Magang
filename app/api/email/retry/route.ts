import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { sendDecisionEmail } from "@/lib/email";

export async function POST(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ applicantId: z.uuid() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  try {
    const result = await sendDecisionEmail(parsed.data.applicantId);
    if (!result.sent) return Response.json({ error: "Email belum berhasil dikirim. Periksa konfigurasi SMTP." }, { status: 502 });
    return Response.json({ result: "ok" });
  } catch {
    return Response.json({ error: "Layanan email belum dikonfigurasi." }, { status: 503 });
  }
}
