import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { resendLastApplicantEmail } from "@/lib/email";

export async function POST(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ applicantId: z.uuid() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  try {
    const result = await resendLastApplicantEmail(parsed.data.applicantId);
    if (!result.sent) return Response.json({ error: result.message ?? "Email belum berhasil dikirim." }, { status: 502 });
    return Response.json({ result: "ok", emailSent: true, emailMessage: result.message });
  } catch {
    return Response.json({ error: "Layanan email belum dikonfigurasi." }, { status: 503 });
  }
}
