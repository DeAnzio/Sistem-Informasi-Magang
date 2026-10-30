import { readAllPages, ExportDataChangedError } from "@/lib/read-all-pages";
import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/normalize-relation";
import { createCsv, createXlsx, type ExportRow } from "@/lib/export";
import { buildApplicantQuery, type ApplicantFilters } from "@/lib/pemagang-filters";
import { fasePemagang, hariIniWIB } from "@/lib/tanggal";
import type { ApplicantStatus } from "@/lib/types";

export const runtime = "nodejs";

const statusSchema = z.enum(["pending", "diterima", "ditolak", "dibatalkan", "perbaikan", "diperiksa", "tunggu", "selesai"]);
const phaseSchema = z.enum(["akan_datang", "aktif", "selesai"]);
const sortSchema = z.enum(["terbaru", "tanggal_mulai", "nama"]);
const dateSchema = z.iso.date();
const maxExportRows = 5_000;

const statusLabels: Record<ApplicantStatus, string> = {
  pending: "Menunggu pemeriksaan",
  perbaikan: "Perlu perbaikan",
  diperiksa: "Pemeriksaan ulang",
  tunggu: "Daftar tunggu",
  selesai: "Selesai magang",
  diterima: "Diterima",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};
const phaseLabels = {
  akan_datang: "Akan datang",
  aktif: "Aktif",
  selesai: "Selesai",
} as const;

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date).replace(/\//g, "-");
}

export async function GET(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const format = z.enum(["xlsx", "csv"]).safeParse(params.get("format"));
  if (!format.success) return Response.json({ error: "Format ekspor harus xlsx atau csv." }, { status: 400 });

  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const statusRaw = params.get("status") ?? "";
  const phaseRaw = params.get("fase") ?? "";
  const sortRaw = params.get("urut") || "terbaru";
  const divisionRaw = params.get("divisi") ?? "";
  const fromRaw = params.get("dari") ?? "";
  const throughRaw = params.get("sampai") ?? "";
  const status = statusRaw ? statusSchema.safeParse(statusRaw) : null;
  const phase = phaseRaw ? phaseSchema.safeParse(phaseRaw) : null;
  const sort = sortSchema.safeParse(sortRaw);
  const division = divisionRaw ? z.uuid().safeParse(divisionRaw) : null;
  const from = fromRaw ? dateSchema.safeParse(fromRaw) : null;
  const through = throughRaw ? dateSchema.safeParse(throughRaw) : null;

  if (
    (status && !status.success) ||
    (phase && !phase.success) ||
    !sort.success ||
    (division && !division.success) ||
    (from && !from.success) ||
    (through && !through.success) ||
    (from?.success && through?.success && through.data < from.data)
  ) {
    return Response.json({ error: "Filter ekspor tidak valid." }, { status: 400 });
  }

  const filters: ApplicantFilters = {
    q,
    status: phase?.success ? "diterima" : status?.success ? status.data : "",
    phase: phase?.success ? phase.data : "",
    divisionId: division?.success ? division.data : "",
    fromDate: from?.success ? from.data : "",
    throughDate: through?.success ? through.data : "",
    sort: sort.data,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const buildQuery = (head: boolean) => buildApplicantQuery(supabase, filters, head);

    const { count, error: countError } = await buildQuery(true);
    if (countError) {
      console.error("Gagal menghitung data ekspor pemagang.", { message: countError.message });
      return Response.json({ error: "Data ekspor belum dapat dimuat." }, { status: 503 });
    }
    if (count === null) {
      console.error("Jumlah data ekspor tidak tersedia.");
      return Response.json({ error: "Jumlah hasil ekspor belum dapat dipastikan." }, { status: 503 });
    }
    if (count > maxExportRows) {
      return Response.json({ error: "Hasil melebihi 5.000 baris. Persempit filter sebelum mengekspor." }, { status: 422 });
    }

    const data = await readAllPages((from, to) => buildQuery(false).range(from, to), count, maxExportRows);
    if (new Set(data.map((row) => row.id)).size !== data.length) {
      return Response.json({ error: "Data berubah selama ekspor. Muat ulang dan coba kembali." }, { status: 409 });
    }

    const adminIds = Array.from(new Set((data ?? [])
      .map((applicant) => applicant.verified_by)
      .filter((value): value is string => typeof value === "string")));
    const adminNames = new Map<string, string>();
    if (adminIds.length) {
      const { data: admins, error: adminError } = await createSupabaseAdminClient()
        .from("admins")
        .select("user_id, nama")
        .in("user_id", adminIds);
      if (adminError) {
        console.error("Gagal membaca nama admin untuk ekspor.", { message: adminError.message });
        return Response.json({ error: "Nama admin untuk ekspor belum dapat dimuat." }, { status: 503 });
      }
      for (const admin of admins ?? []) adminNames.set(admin.user_id, admin.nama);
    }

    const rows: ExportRow[] = [];
    for (const [index, applicant] of (data ?? []).entries()) {
      const applicantStatus = statusSchema.safeParse(applicant.status);
      if (!applicantStatus.success) {
        console.error("Data pemagang memiliki status yang tidak dikenal pada proses ekspor.");
        return Response.json({ error: "Terdapat status pemagang yang tidak dikenal." }, { status: 503 });
      }
      const phaseValue = fasePemagang(applicantStatus.data, applicant.tanggal_mulai, applicant.tanggal_selesai);
      const divisionData = firstRelation<{ nama: string }>(applicant.divisi);
      rows.push([
        index + 1,
        applicant.nama,
        applicant.email,
        applicant.no_hp,
        applicant.asal_kampus,
        applicant.jurusan,
        divisionData?.nama ?? "",
        formatDate(applicant.tanggal_mulai),
        formatDate(applicant.tanggal_selesai),
        Math.round((Date.parse(`${applicant.tanggal_selesai}T00:00:00Z`) - Date.parse(`${applicant.tanggal_mulai}T00:00:00Z`)) / 86_400_000),
        statusLabels[applicantStatus.data],
        phaseValue ? phaseLabels[phaseValue] : "",
        applicant.sumber === "manual" ? "Manual" : "Online",
        applicant.verified_by ? adminNames.get(applicant.verified_by) ?? "Admin" : "",
        formatDate(applicant.verified_at),
        formatDate(applicant.created_at),
      ]);
    }

    const date = hariIniWIB();
    const extension = format.data;
    const file = `pemagang_${date}.${extension}`;
    const body = extension === "csv" ? createCsv(rows) : await createXlsx(rows);
    const responseBody = typeof body === "string" ? body : new Uint8Array(body).buffer;
    return new Response(responseBody, {
      headers: {
        "Content-Type": extension === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportDataChangedError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "Layanan ekspor pemagang belum tersedia." }, { status: 503 });
  }
}
