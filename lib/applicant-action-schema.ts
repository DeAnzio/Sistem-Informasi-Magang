import { z } from "zod";
import { isDurasiMagangValid } from "./tanggal";
import { durationMessage } from "./applicant-schema";

// Semua keputusan hanya memutasi data dan audit, tanpa pengiriman notifikasi.
export const applicantActionSchema = z.discriminatedUnion("aksi", [
  z.object({ aksi: z.literal("terima") }).strict(),
  z.object({ aksi: z.literal("ubah_divisi"), divisiId: z.uuid() }).strict(),
  z.object({ aksi: z.literal("tolak"), catatan: z.string().trim().max(500).default("") }).strict(),
  z.object({ aksi: z.literal("batalkan"), catatan: z.string().trim().min(3).max(500) }).strict(),
  z.object({ aksi: z.literal("ubah_jadwal"), tanggalMulai: z.iso.date(), tanggalSelesai: z.iso.date() })
    .strict().refine(({ tanggalMulai, tanggalSelesai }) => isDurasiMagangValid(tanggalMulai, tanggalSelesai), {
      path: ["tanggalSelesai"], message: durationMessage,
    }),
]);
export type ApplicantActionInput = z.infer<typeof applicantActionSchema>;
