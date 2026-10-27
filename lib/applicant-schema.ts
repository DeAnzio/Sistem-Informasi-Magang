import { z } from "zod";
import { isDurasiMagangValid } from "./tanggal";

export const durationMessage = "Tanggal selesai harus sekurang-kurangnya satu bulan setelah tanggal mulai dan durasi maksimal 366 hari.";
export const maxFileSize = 5 * 1024 * 1024;
export const acceptedFileTypes = new Map([
  ["application/pdf", "pdf"], ["image/jpeg", "jpg"], ["image/png", "png"],
]);
export const fileMetadataSchema = z.object({
  type: z.enum(["application/pdf", "image/jpeg", "image/png"], { error: "Berkas harus berupa PDF, JPG, atau PNG." }),
  size: z.number().int().positive("Berkas tidak boleh kosong.").max(maxFileSize, "Berkas maksimal 5 MB."),
});
export const applicantFields = z.object({
  nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120),
  email: z.string().trim().pipe(z.email("Alamat email tidak valid.").max(254)),
  no_hp: z.string().regex(/^[0-9]{8,13}$/, "Nomor HP harus berisi 8 sampai 13 digit angka."),
  asal_kampus: z.string().trim().min(2, "Asal perguruan tinggi minimal 2 karakter.").max(160),
  jurusan: z.string().trim().min(2, "Program studi minimal 2 karakter.").max(30),
  nim: z.string().regex(/^[0-9]{2,15}$/, "NIM harus berisi 2 sampai 15 digit angka."),
  tanggal_mulai: z.iso.date("Tanggal mulai tidak valid."),
  tanggal_selesai: z.iso.date("Tanggal selesai tidak valid."),
});
export function validApplicantDuration(data: { tanggal_mulai: string; tanggal_selesai: string }) {
  return isDurasiMagangValid(data.tanggal_mulai, data.tanggal_selesai);
}
export const durationIssue = { path: ["tanggal_selesai"], message: durationMessage };
export const applicantSchema = applicantFields.refine(validApplicantDuration, durationIssue);
export const manualApplicantSchema = applicantFields.extend({ divisi_id: z.uuid() })
  .refine(validApplicantDuration, durationIssue);

export function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ");
}
