import type { ApplicantStatus } from "@/lib/types";

export type FasePemagang = "akan_datang" | "aktif" | "selesai";

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
