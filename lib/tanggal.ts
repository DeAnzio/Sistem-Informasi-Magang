import type { ApplicantStatus } from "@/lib/types";

export type FasePemagang = "akan_datang" | "aktif" | "selesai";

function isIsoDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value;
}

export function tanggalMinimumSelesai(tanggalMulai: string): string | null {
  if (!isIsoDate(tanggalMulai)) return null;
  const [year, month, day] = tanggalMulai.split("-").map(Number);
  const targetMonthIndex = month % 12;
  const targetYear = year + (month === 12 ? 1 : 0);
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function isDurasiMagangValid(tanggalMulai: string, tanggalSelesai: string): boolean {
  const minimumSelesai = tanggalMinimumSelesai(tanggalMulai);
  if (!minimumSelesai || !isIsoDate(tanggalSelesai) || tanggalSelesai < minimumSelesai) return false;
  const durationDays = (Date.parse(`${tanggalSelesai}T00:00:00Z`) - Date.parse(`${tanggalMulai}T00:00:00Z`)) / 86_400_000;
  return durationDays <= 366;
}

export function hariIniWIB(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

export function fasePemagang(
  status: ApplicantStatus,
  mulai: string,
  selesai: string,
): FasePemagang | null {
  if (status !== "diterima") return null;

  const hariIni = hariIniWIB();
  if (hariIni < mulai) return "akan_datang";
  if (hariIni > selesai) return "selesai";
  return "aktif";
}
