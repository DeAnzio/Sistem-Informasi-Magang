import { hasValidOrigin } from "@/lib/request-origin";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createManualApplicantTicket, verifyManualApplicantTicket } from "@/lib/manual-applicant-ticket";
import { manualApplicantSchema, fileMetadataSchema, acceptedFileTypes, validationMessage } from "@/lib/applicant-schema";
import { cleanupUpload } from "@/lib/upload-session";

export const runtime = "nodejs";

const acceptedTypes = acceptedFileTypes;
const requestSchema = z.discriminatedUnion("tahap", [
  z.object({
    tahap: z.literal("siapkan"),
    applicant: manualApplicantSchema,
    statusAwal: z.enum(["pending", "diterima"]).default("diterima"),
    berkas_cv: fileMetadataSchema.nullable().default(null),
    berkas_surat_pengantar: fileMetadataSchema.nullable().default(null),
  }).strict(),
  z.object({ tahap: z.literal("simpan"), ticket: z.string().min(1).max(8192) }).strict(),
  z.object({ tahap: z.literal("hapus"), ticket: z.string().min(1).max(8192) }).strict(),
]);

export async function POST(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    if (parsed.data.tahap === "siapkan") {
      const { data: division, error: divisionError } = await supabase
        .from("divisi")
        .select("id")
        .eq("id", parsed.data.applicant.divisi_id)
        .eq("aktif", true)
        .maybeSingle();
      if (divisionError) {
        console.error("Gagal memeriksa divisi input manual.", { message: divisionError.message });
        return Response.json({ error: "Divisi belum dapat diperiksa." }, { status: 503 });
      }
      if (!division) return Response.json({ error: "Divisi tidak ditemukan atau tidak aktif." }, { status: 404 });

      const applicantId = randomUUID();
      const files = {
        berkas_cv: parsed.data.berkas_cv
          ? `${applicantId}/cv.${acceptedTypes.get(parsed.data.berkas_cv.type)}`
          : null,
        berkas_surat_pengantar: parsed.data.berkas_surat_pengantar
          ? `${applicantId}/surat-pengantar.${acceptedTypes.get(parsed.data.berkas_surat_pengantar.type)}`
          : null,
      };
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const { error: sessionError } = await supabase.from("sesi_unggahan").insert({
        id: applicantId, admin_id: adminId, sumber: "manual", status_awal: parsed.data.statusAwal, applicant: parsed.data.applicant,
        files, expires_at: new Date(expiresAt).toISOString(),
      });
      if (sessionError) throw new Error("Sesi unggahan belum dapat disiapkan.");
      const uploads: { jenis: "cv" | "surat"; path: string; token: string }[] = [];
      for (const [jenis, path] of [["cv", files.berkas_cv], ["surat", files.berkas_surat_pengantar]] as const) {
        if (!path) continue;
        const { data: upload, error: uploadError } = await supabase.storage.from("berkas").createSignedUploadUrl(path);
        if (uploadError || !upload) {
          console.error("Gagal membuat signed upload URL untuk input manual.", {
            statusCode: uploadError?.statusCode,
            message: uploadError?.message,
          });
          return Response.json({ error: "Tautan unggah berkas belum dapat dibuat. Periksa bucket Storage." }, { status: 503 });
        }
        uploads.push({ jenis, path, token: upload.token });
      }

      const ticket = createManualApplicantTicket({
        applicantId,
        adminId,
        expiresAt,
        applicant: parsed.data.applicant,
        statusAwal: parsed.data.statusAwal,
        files,
      });
      return Response.json({ ticket, uploads }, { status: 201 });
    }

    const ticket = verifyManualApplicantTicket(parsed.data.ticket);
    if (!ticket || ticket.adminId !== adminId) {
      return Response.json({ error: "Tiket input manual tidak valid atau kedaluwarsa. Silakan mulai kembali." }, { status: 400 });
    }

    const paths = Object.values(ticket.files).filter((path): path is string => path !== null);
    if (parsed.data.tahap === "hapus") {
      const cleaned = await cleanupUpload(supabase, ticket.applicantId, paths, adminId);
      return Response.json(cleaned ? { cleaned: true } : { error: "Berkas pendaftaran tersimpan tidak dapat dihapus." }, { status: cleaned ? 200 : 409 });
    }
    const { data: saved, error: saveError } = await supabase.rpc("simpan_pendaftaran", {
      p_id: ticket.applicantId, p_admin: adminId,
    });
    if (saveError) return Response.json({ error: "Data pemagang belum dapat disimpan. Coba kirim kembali." }, { status: 503 });
    const result = z.object({ id: z.uuid(), status: z.enum(["pending", "diterima"]), alreadySaved: z.boolean(), notice: z.string().nullable().optional() }).safeParse(saved);
    if (!result.success) {
      const failure = z.object({ error: z.string() }).safeParse(saved);
      const duplicate = failure.success && failure.data.error === "pendaftaran_duplikat";
      return Response.json({ error: duplicate ? "NIM sudah terdaftar pada tanggal mulai dan penempatan tersebut." : "Tiket atau berkas tidak valid. Mulai kembali input manual." }, { status: duplicate ? 409 : 400 });
    }
    if (result.data.alreadySaved) return Response.json(result.data);
    const applicant = { id: result.data.id };

    const status = result.data.status;
    return Response.json({
      id: applicant.id, status,
      ...(result.data.notice ? { notice: result.data.notice } : {}),
    }, { status: 201 });
  } catch {
    return Response.json({ error: "Layanan input pemagang belum tersedia." }, { status: 503 });
  }
}
