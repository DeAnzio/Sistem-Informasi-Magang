export type ApplicantStatus = "pending" | "diterima" | "ditolak" | "dibatalkan" | "perbaikan" | "diperiksa" | "tunggu" | "selesai";

export type ApplicantSource = "online" | "manual";

export type ApplicantActivityAction =
  | "input_manual"
  | "terima"
  | "tolak"
  | "batalkan"
  | "ubah_divisi"
  | "ubah_jadwal"
  | "unduh_berkas";

export type ApplicantActivity = {
  id: string;
  applicant_id: string;
  aksi: ApplicantActivityAction;
  detail: Record<string, unknown> | null;
  oleh: string | null;
  waktu: string;
};
