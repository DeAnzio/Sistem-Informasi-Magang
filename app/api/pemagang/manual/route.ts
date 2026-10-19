import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createManualApplicantTicket, verifyManualApplicantTicket } from "@/lib/manual-applicant-ticket";
import { sendApplicantEmail } from "@/lib/email";

export const runtime = "nodejs";

const maxFileSize = 5 * 1024 * 1024;
const acceptedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
const fileMetadataSchema = z.object({
  type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size: z.number().int().positive().max(maxFileSize),
});
const applicantDataSchema = z.object({
  nama: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  no_hp: z.string().trim().min(8).max(30),
  asal_kampus: z.string().trim().min(2).max(160),
  jurusan: z.string().trim().min(2).max(160),
  nim: z.string().trim().min(2).max(50),
  divisi_id: z.uuid(),
  tanggal_mulai: z.iso.date(),
  tanggal_selesai: z.iso.date(),
}).refine(({ tanggal_mulai, tanggal_selesai }) => {
  const duration = (Date.parse(`${tanggal_selesai}T00:00:00Z`) - Date.parse(`${tanggal_mulai}T00:00:00Z`)) / 86_400_000;
  return duration > 0 && duration <= 366;
}, { path: ["tanggal_selesai"], message: "Tanggal selesai harus setelah tanggal mulai dan durasi maksimal 366 hari." });

const requestSchema = z.discriminatedUnion("tahap", [
  z.object({
    tahap: z.literal("siapkan"),
    applicant: applicantDataSchema,
    statusAwal: z.enum(["pending", "diterima"]).default("diterima"),
    kirimEmail: z.boolean().default(true),
    berkas_cv: fileMetadataSchema.nullable().default(null),
    berkas_surat_pengantar: fileMetadataSchema.nullable().default(null),
  }).strict(),
  z.object({ tahap: z.literal("simpan"), ticket: z.string().min(1).max(8192) }).strict(),
  z.object({ tahap: z.literal("hapus"), ticket: z.string().min(1).max(8192) }).strict(),
]);

function mimeTypeForExtension(extension: string | undefined): string | null {
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}

export async function POST(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Data pemagang tidak valid." }, { status: 400 });
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
        expiresAt: Date.now() + 15 * 60 * 1000,
        applicant: parsed.data.applicant,
        statusAwal: parsed.data.statusAwal,
        kirimEmail: parsed.data.kirimEmail,
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
      if (!paths.length) return Response.json({ cleaned: true });
      const { error: removeError } = await supabase.storage.from("berkas").remove(paths);
      if (removeError) {
        console.error("Gagal membersihkan berkas input manual.", { message: removeError.message });
        return Response.json({ error: "Berkas sementara belum dapat dibersihkan." }, { status: 503 });
      }
      return Response.json({ cleaned: true });
    }

    const { data: existing, error: existingError } = await supabase
      .from("applicants")
      .select("id, status")
      .eq("id", ticket.applicantId)
      .maybeSingle();
    if (existingError) {
      console.error("Gagal memeriksa kiriman input manual.", { message: existingError.message });
      return Response.json({ error: "Status penyimpanan belum dapat diperiksa." }, { status: 503 });
    }
    if (existing) return Response.json({ id: existing.id, status: existing.status, alreadySaved: true });

    if (paths.length) {
      const { data: storedFiles, error: storageError } = await supabase.storage
        .from("berkas")
        .list(ticket.applicantId);
      const storedByName = new Map((storedFiles ?? []).map((file) => [file.name, file]));
      const filesValid = paths.every((path) => {
        const name = path.split("/").at(-1);
        const file = name ? storedByName.get(name) : undefined;
        const extension = path.split(".").at(-1);
        const expectedType = mimeTypeForExtension(extension);
        const size = Number(file?.metadata?.size);
        return Boolean(
          file &&
          expectedType &&
          file.metadata?.mimetype === expectedType &&
          size > 0 &&
          size <= maxFileSize,
        );
      });
      if (storageError || !filesValid) {
        const { error: removeError } = await supabase.storage.from("berkas").remove(paths);
        if (removeError) console.error("Gagal membersihkan unggahan manual yang tidak valid.", { message: removeError.message });
        return Response.json({ error: "Berkas belum berhasil diunggah atau formatnya tidak sesuai." }, { status: 400 });
      }
    }

    const { data: applicant, error: insertError } = await supabase
      .from("applicants")
      .insert({
        id: ticket.applicantId,
        ...ticket.applicant,
        status: "pending",
        sumber: "manual",
        berkas_cv: ticket.files.berkas_cv,
        berkas_surat_pengantar: ticket.files.berkas_surat_pengantar,
      })
      .select("id")
      .single();
    if (insertError || !applicant) {
      const { error: removeError } = paths.length
        ? await supabase.storage.from("berkas").remove(paths)
        : { error: null };
      if (removeError) console.error("Gagal membersihkan unggahan setelah penyimpanan manual gagal.", { message: removeError.message });
      if (insertError?.code === "23505") {
        return Response.json({ error: "NIM sudah terdaftar pada divisi dan tanggal mulai tersebut." }, { status: 409 });
      }
      console.error("Gagal menyimpan pemagang manual.", { message: insertError?.message });
      return Response.json({ error: "Data pemagang belum dapat disimpan." }, { status: 500 });
    }

    const { error: activityError } = await supabase.from("aktivitas_pendaftar").insert({
      applicant_id: applicant.id,
      aksi: "input_manual",
      oleh: adminId,
    });
    if (activityError) {
      console.error("Gagal mencatat aktivitas input manual.", { message: activityError.message });
      return Response.json({
        id: applicant.id,
        status: "pending",
        message: "Data tersimpan sebagai pending, tetapi riwayat aktivitas belum tercatat.",
        notice: "riwayat_gagal",
      }, { status: 201 });
    }

    let status: "pending" | "diterima" = "pending";
    let message: string | undefined;
    if (ticket.statusAwal === "diterima") {
      const { data: decision, error: decisionError } = await supabase.rpc("terima_pendaftar", {
        p_id: applicant.id,
        p_admin: adminId,
      });
      if (decision === "ok" && !decisionError) {
        status = "diterima";
      } else if (decision === "kuota_penuh" && !decisionError) {
        message = "Data tersimpan sebagai pending karena divisi penuh pada tanggal tersebut.";
        return Response.json({ id: applicant.id, status, message, notice: "kuota_penuh" }, { status: 201 });
      } else {
        console.error("RPC penerimaan pemagang manual gagal.", { message: decisionError?.message });
        message = "Data tersimpan sebagai pending karena status diterima belum dapat diproses.";
        return Response.json({ id: applicant.id, status, message, notice: "terima_gagal" }, { status: 201 });
      }
    }

    let emailSent: boolean | null = null;
    if (status === "diterima" && ticket.kirimEmail) {
      try {
        const email = await sendApplicantEmail(applicant.id, "diterima");
        emailSent = email.sent;
        if (!email.sent) {
          message = "Data diterima, tetapi email pemberitahuan belum berhasil dikirim.";
        } else if (!email.logged) {
          message = "Data diterima dan email terkirim, tetapi riwayat email belum tercatat.";
        }
      } catch {
        emailSent = false;
        message = "Data diterima, tetapi email belum dapat diproses.";
        console.error("Pengiriman email untuk pemagang manual gagal.");
      }
    }

    return Response.json({
      id: applicant.id,
      status,
      message,
      emailSent,
      ...(emailSent === false ? { notice: "email_gagal" } : {}),
      ...(emailSent === true && message ? { notice: "email_log_gagal" } : {}),
    }, { status: 201 });
  } catch {
    return Response.json({ error: "Layanan input pemagang belum tersedia." }, { status: 503 });
  }
}
