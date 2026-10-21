import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyRegistrationTicket } from "@/lib/registration-ticket";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  const body = await request.json().catch(() => null) as { ticket?: unknown; cleanup?: unknown } | null;
  if (!body || typeof body.ticket !== "string") return Response.json({ error: "Tiket pendaftaran tidak valid." }, { status: 400 });

  let payload;
  try {
    payload = verifyRegistrationTicket(body.ticket);
  } catch {
    return Response.json({ error: "Layanan pendaftaran belum dikonfigurasi." }, { status: 503 });
  }
  if (!payload) return Response.json({ error: "Tiket tidak valid atau telah kedaluwarsa. Silakan mulai pendaftaran kembali." }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const paths = Object.values(payload.files);
    if (body.cleanup === true) {
      await supabase.storage.from("berkas").remove(paths);
      return Response.json({ cleaned: true });
    }

    const { data: existingApplicant } = await supabase.from("applicants").select("id").eq("id", payload.applicantId).maybeSingle();
    if (existingApplicant) return Response.json({ id: payload.applicantId }, { status: 200 });

    const { data: storedFiles, error: storageError } = await supabase.storage.from("berkas").list(payload.applicantId);
    const storedByName = new Map((storedFiles ?? []).map((file) => [file.name, file]));
    const filesValid = paths.every((path) => {
      const file = storedByName.get(path.split("/").at(-1)!);
      const extension = path.split(".").at(-1);
      const expectedType = extension === "pdf" ? "application/pdf" : extension === "jpg" ? "image/jpeg" : "image/png";
      const size = Number(file?.metadata?.size);
      return Boolean(file && size > 0 && size <= 5 * 1024 * 1024 && file.metadata?.mimetype === expectedType);
    });
    if (storageError || !filesValid) {
      await supabase.storage.from("berkas").remove(paths);
      return Response.json({ error: "Berkas belum berhasil diunggah. Silakan ulangi pendaftaran." }, { status: 400 });
    }

    const { error } = await supabase.from("applicants").insert({
      id: payload.applicantId,
      ...payload.applicant,
      divisi_id: null,
      berkas_cv: payload.files.berkas_cv,
      berkas_surat_pengantar: payload.files.berkas_surat_pengantar,
      sumber: "online",
    });
    if (error) {
      const { data: insertedApplicant } = await supabase.from("applicants").select("id").eq("id", payload.applicantId).maybeSingle();
      if (insertedApplicant) return Response.json({ id: payload.applicantId }, { status: 200 });
      await supabase.storage.from("berkas").remove(paths);
      if (error.code === "23505") return Response.json({ error: "NIM ini sudah terdaftar pada divisi dan tanggal mulai tersebut." }, { status: 409 });
      return Response.json({ error: "Pendaftaran belum dapat disimpan. Silakan coba kembali." }, { status: 500 });
    }
    return Response.json({ id: payload.applicantId }, { status: 201 });
  } catch {
    return Response.json({ error: "Layanan pendaftaran belum tersedia." }, { status: 503 });
  }
}
