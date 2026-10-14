import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createRegistrationTicket } from "@/lib/registration-ticket";
import { verifyRegistrationRecaptcha } from "@/lib/recaptcha";

export const runtime = "nodejs";

const requestSchema = z.object({
  nama: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  no_hp: z.string().trim().min(8).max(30),
  asal_kampus: z.string().trim().min(2).max(160),
  jurusan: z.string().trim().min(2).max(160),
  nim: z.string().trim().min(2).max(50),
  divisi_id: z.uuid(),
  tanggal_mulai: z.iso.date(),
  tanggal_selesai: z.iso.date(),
  recaptchaToken: z.string().min(1).max(4096),
  berkas_cv: z.object({ type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024) }),
  berkas_surat_pengantar: z.object({ type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024) }),
}).refine(({ tanggal_mulai, tanggal_selesai }) => {
  const duration = (Date.parse(`${tanggal_selesai}T00:00:00Z`) - Date.parse(`${tanggal_mulai}T00:00:00Z`)) / 86_400_000;
  return duration > 0 && duration <= 366;
}, { path: ["tanggal_selesai"], message: "Tanggal selesai harus setelah tanggal mulai dan durasi maksimal 366 hari." });

const acceptedTypes = new Map([["application/pdf", "pdf"], ["image/jpeg", "jpg"], ["image/png", "png"]]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Layanan pendaftaran belum dikonfigurasi." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Periksa data dan berkas pendaftaran." }, { status: 400 });
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
    const { data: division, error: divisionError } = await supabase.from("divisi").select("id").eq("id", parsed.data.divisi_id).eq("aktif", true).maybeSingle();
    if (divisionError || !division) return Response.json({ error: "Divisi permagangan tidak ditemukan atau tidak aktif." }, { status: 404 });
    const { data: remainingCapacity, error: capacityError } = await supabase.rpc("sisa_kuota_rentang", {
      p_divisi: parsed.data.divisi_id,
      p_mulai: parsed.data.tanggal_mulai,
      p_selesai: parsed.data.tanggal_selesai,
    });
    if (capacityError) return Response.json({ error: "Kapasitas untuk tanggal tersebut belum dapat diperiksa." }, { status: 503 });
    if (remainingCapacity <= 0) return Response.json({ error: "Kuota divisi telah penuh pada rentang tanggal yang dipilih." }, { status: 409 });

    const applicantId = randomUUID();
    const files = {
      berkas_cv: `${applicantId}/cv.${acceptedTypes.get(parsed.data.berkas_cv.type)}`,
      berkas_surat_pengantar: `${applicantId}/surat-pengantar.${acceptedTypes.get(parsed.data.berkas_surat_pengantar.type)}`,
    };
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
      expiresAt: Date.now() + 15 * 60 * 1000,
      applicant: {
        nama: parsed.data.nama,
        email: parsed.data.email,
        no_hp: parsed.data.no_hp,
        asal_kampus: parsed.data.asal_kampus,
        jurusan: parsed.data.jurusan,
        nim: parsed.data.nim,
        divisi_id: parsed.data.divisi_id,
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
