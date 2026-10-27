import { hasValidOrigin } from "@/lib/request-origin";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRegistrationTicket } from "@/lib/registration-ticket";
import { verifyRegistrationRecaptcha } from "@/lib/recaptcha";
import { applicantFields, fileMetadataSchema, validApplicantDuration, durationIssue, acceptedFileTypes, validationMessage } from "@/lib/applicant-schema";

export const runtime = "nodejs";

const requestSchema = applicantFields.extend({
  recaptchaToken: z.string().min(1).max(4096),
  berkas_cv: fileMetadataSchema,
  berkas_surat_pengantar: fileMetadataSchema,
}).refine(validApplicantDuration, durationIssue);
const acceptedTypes = acceptedFileTypes;

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Layanan pendaftaran belum dikonfigurasi." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const recaptcha = await verifyRegistrationRecaptcha(parsed.data.recaptchaToken, new URL(request.url).hostname);
  if (!recaptcha.ok) {
    if (recaptcha.reason === "rejected") {
      console.warn("Pemeriksaan reCAPTCHA menolak permintaan pendaftaran.");
      return Response.json({ error: "Pemeriksaan keamanan gagal. Muat ulang halaman dan coba kembali." }, { status: 403 });
    }
    if (recaptcha.reason === "request_failed") {
      console.error("Layanan verifikasi reCAPTCHA tidak dapat dihubungi.");
      return Response.json({ error: "Layanan pemeriksaan keamanan sedang tidak tersedia. Silakan coba kembali." }, { status: 503 });
    }
    return Response.json({ error: "reCAPTCHA belum dikonfigurasi pada server." }, { status: 503 });
  }
  for (const file of [parsed.data.berkas_cv, parsed.data.berkas_surat_pengantar]) {
    if (!acceptedTypes.has(file.type)) return Response.json({ error: "Berkas harus berupa PDF, JPG, atau PNG." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const applicantId = randomUUID();
    const files = {
      berkas_cv: `${applicantId}/cv.${acceptedTypes.get(parsed.data.berkas_cv.type)}`,
      berkas_surat_pengantar: `${applicantId}/surat-pengantar.${acceptedTypes.get(parsed.data.berkas_surat_pengantar.type)}`,
    };
    const applicant = applicantFields.parse(parsed.data);
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const { error: sessionError } = await supabase.from("sesi_unggahan").insert({
      id: applicantId, sumber: "online", applicant, files, expires_at: new Date(expiresAt).toISOString(),
    });
    if (sessionError) throw new Error("Sesi unggahan belum dapat disiapkan.");
    const uploads = [];
    for (const path of Object.values(files)) {
      const { data, error } = await supabase.storage.from("berkas").createSignedUploadUrl(path);
      if (error || !data) {
        console.error("Gagal membuat signed upload URL untuk bucket berkas.", {
          statusCode: error?.statusCode,
          message: error?.message,
        });
        const bucketMissing = error?.message.toLowerCase().includes("bucket not found");
        return Response.json({
          error: bucketMissing
            ? "Bucket 'berkas' belum ditemukan pada project Supabase. Buat bucket dengan nama persis 'berkas', lalu coba lagi."
            : "Supabase tidak dapat membuat tautan unggah. Periksa bucket 'berkas' dan pastikan SUPABASE_SERVICE_ROLE_KEY berasal dari project Supabase yang sama.",
        }, { status: 503 });
      }
      uploads.push({ path, token: data.token });
    }

    const ticket = createRegistrationTicket({
      applicantId,
      expiresAt,
      applicant: {
        nama: parsed.data.nama,
        email: parsed.data.email,
        no_hp: parsed.data.no_hp,
        asal_kampus: parsed.data.asal_kampus,
        jurusan: parsed.data.jurusan,
        nim: parsed.data.nim,
        tanggal_mulai: parsed.data.tanggal_mulai,
        tanggal_selesai: parsed.data.tanggal_selesai,
      },
      files,
    });
    return Response.json({ ticket, uploads }, { status: 201 });
  } catch {
    return Response.json({ error: "Layanan pendaftaran belum tersedia. Silakan coba kembali." }, { status: 503 });
  }
}
