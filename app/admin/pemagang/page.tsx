import Link from "next/link";
import { z } from "zod";
import { fasePemagang, hariIniWIB } from "@/lib/tanggal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/normalize-relation";
import { escapeApplicantSearchTerm } from "@/lib/pemagang-filters";
import type { ApplicantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const pageSize = 20;
const statusSchema = z.enum(["pending", "diterima", "ditolak", "dibatalkan"]);
const phaseSchema = z.enum(["akan_datang", "aktif", "selesai"]);
const sortSchema = z.enum(["terbaru", "tanggal_mulai", "nama"]);
const dateSchema = z.iso.date();

const statusLabels: Record<ApplicantStatus, string> = {
  pending: "Menunggu",
  diterima: "Diterima",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};

const phaseLabels = {
  akan_datang: "Akan datang",
  aktif: "Aktif",
  selesai: "Selesai",
} as const;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function buildApplicantQuery(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: {
    q: string;
    status: string;
    phase: string;
    divisionId: string;
    fromDate: string;
    throughDate: string;
    sort: "terbaru" | "tanggal_mulai" | "nama";
  },
  head = false,
) {
  let query = supabase
    .from("applicants")
    .select("id, nama, nim, asal_kampus, tanggal_mulai, tanggal_selesai, status, divisi:divisi(nama)", { count: "exact", head });

  if (filters.q) {
    const safeQuery = escapeApplicantSearchTerm(filters.q);
    query = query.or(`nama.ilike.%${safeQuery}%,nim.ilike.%${safeQuery}%,asal_kampus.ilike.%${safeQuery}%`);
  }
  if (filters.phase) {
    const today = hariIniWIB();
    query = query.eq("status", "diterima");
    if (filters.phase === "akan_datang") query = query.gt("tanggal_mulai", today);
    if (filters.phase === "aktif") query = query.lte("tanggal_mulai", today).gte("tanggal_selesai", today);
    if (filters.phase === "selesai") query = query.lt("tanggal_selesai", today);
  } else if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.divisionId) query = query.eq("divisi_id", filters.divisionId);
  if (filters.throughDate) query = query.lte("tanggal_mulai", filters.throughDate);
  if (filters.fromDate) query = query.gte("tanggal_selesai", filters.fromDate);

  if (filters.sort === "tanggal_mulai") query = query.order("tanggal_mulai", { ascending: true }).order("created_at", { ascending: false });
  else if (filters.sort === "nama") query = query.order("nama", { ascending: true });
  else query = query.order("created_at", { ascending: false });

  return query;
}

export default async function PemagangPage({
  searchParams,
}: PageProps<"/admin/pemagang">) {
  const params = await searchParams;
  const q = firstParam(params.q).trim().slice(0, 100);
  const statusResult = statusSchema.safeParse(firstParam(params.status));
  const phaseResult = phaseSchema.safeParse(firstParam(params.fase));
  const sortResult = sortSchema.safeParse(firstParam(params.urut));
  const fromResult = dateSchema.safeParse(firstParam(params.dari));
  const throughResult = dateSchema.safeParse(firstParam(params.sampai));
  const pageResult = z.coerce.number().int().min(1).safeParse(firstParam(params.page) || "1");
  const status = statusResult.success ? statusResult.data : "";
  const phase = phaseResult.success ? phaseResult.data : "";
  const sort = sortResult.success ? sortResult.data : "terbaru";
  const fromDate = fromResult.success ? fromResult.data : "";
  const throughDate = throughResult.success ? throughResult.data : "";
  const requestedPage = pageResult.success ? pageResult.data : 1;
  const divisionId = firstParam(params.divisi);
  const invalidDateRange = Boolean(fromDate && throughDate && throughDate < fromDate);
  const invalidFilter =
    Boolean(firstParam(params.status) && !statusResult.success) ||
    Boolean(firstParam(params.fase) && !phaseResult.success) ||
    Boolean(firstParam(params.urut) && !sortResult.success) ||
    Boolean(firstParam(params.dari) && !fromResult.success) ||
    Boolean(firstParam(params.sampai) && !throughResult.success) ||
    Boolean(firstParam(params.page) && !pageResult.success) ||
    invalidDateRange;

  let divisions: { id: string; nama: string }[] = [];
  let applicants: {
    id: string;
    nama: string;
    nim: string;
    asal_kampus: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    status: ApplicantStatus;
    divisi: { nama: string } | null;
  }[] = [];
  let total = 0;
  let currentPage = requestedPage;
  let unavailable = false;
  let invalidDivision = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: divisionData, error: divisionError } = await supabase
      .from("divisi")
      .select("id, nama")
      .order("urutan");
    if (divisionError) {
      unavailable = true;
    } else {
      divisions = divisionData ?? [];
    }

    invalidDivision = Boolean(divisionId && !divisions.some((division) => division.id === divisionId));

    if (!invalidFilter && !invalidDivision && !unavailable) {
      const filters = {
        q,
        status: phase ? "diterima" : status,
        phase,
        divisionId,
        fromDate,
        throughDate,
        sort,
      };
      const { count, error: countError } = await buildApplicantQuery(supabase, filters, true);
      if (countError) {
        unavailable = true;
      } else {
        total = count ?? 0;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        currentPage = Math.min(requestedPage, pageCount);
        const { data, error: applicantsError } = await buildApplicantQuery(supabase, filters)
          .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
        if (applicantsError) {
          unavailable = true;
        } else {
          applicants = (data ?? []).map((applicant) => ({
            ...applicant,
            status: applicant.status as ApplicantStatus,
            divisi: firstRelation<{ nama: string }>(applicant.divisi),
          }));
        }
      }
    }
  } catch {
    unavailable = true;
  }

  const selectedStatus = phase ? "diterima" : status;
  const selectedDivision = invalidDivision ? "" : divisionId;
  const currentParams = new URLSearchParams();
  if (q) currentParams.set("q", q);
  if (selectedStatus) currentParams.set("status", selectedStatus);
  if (selectedDivision) currentParams.set("divisi", selectedDivision);
  if (phase) currentParams.set("fase", phase);
  if (fromDate) currentParams.set("dari", fromDate);
  if (throughDate) currentParams.set("sampai", throughDate);
  if (sort !== "terbaru") currentParams.set("urut", sort);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageUrl = (page: number) => {
    const nextParams = new URLSearchParams(currentParams);
    nextParams.set("page", String(page));
    return `/admin/pemagang?${nextParams.toString()}`;
  };
  const exportUrl = (format: "xlsx" | "csv") => {
    const exportParams = new URLSearchParams(currentParams);
    exportParams.set("format", format);
    return `/api/export?${exportParams.toString()}`;
  };

  return (
    <main className="admin-shell">
      <div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href="/admin">Kembali ke dashboard <span aria-hidden="true">↗</span></Link></div></div>
      <header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link></header>
      <section className="page-main shell">
        <div className="page-head"><p className="eyebrow">DATA PESERTA</p><h1>Daftar pemagang</h1><p>Telusuri seluruh pendaftar dan pantau status kegiatan magang.</p></div>
        <form className="admin-filters" action="/admin/pemagang" method="get">
          <div className="form-grid">
            <div className="field"><label htmlFor="q">Pencarian</label><input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Nama, NIM, atau asal kampus" /></div>
            <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={selectedStatus}><option value="">Semua status</option><option value="pending">Menunggu</option><option value="diterima">Diterima</option><option value="ditolak">Ditolak</option><option value="dibatalkan">Dibatalkan</option></select></div>
            <div className="field"><label htmlFor="divisi">Divisi</label><select id="divisi" name="divisi" defaultValue={selectedDivision}><option value="">Semua divisi</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.nama}</option>)}</select></div>
            <div className="field"><label htmlFor="fase">Fase pemagangan</label><select id="fase" name="fase" defaultValue={phase}><option value="">Semua fase</option><option value="akan_datang">Akan datang</option><option value="aktif">Aktif</option><option value="selesai">Selesai</option></select></div>
            <div className="field"><label htmlFor="dari">Tanggal mulai periode</label><input id="dari" name="dari" type="date" defaultValue={fromDate} /></div>
            <div className="field"><label htmlFor="sampai">Tanggal akhir periode</label><input id="sampai" name="sampai" type="date" defaultValue={throughDate} /></div>
            <div className="field"><label htmlFor="urut">Urutkan</label><select id="urut" name="urut" defaultValue={sort}><option value="terbaru">Pendaftaran terbaru</option><option value="tanggal_mulai">Tanggal mulai</option><option value="nama">Nama A–Z</option></select></div>
          </div>
          <div className="filter-actions"><button className="button button-green" type="submit">Terapkan filter</button><Link className="text-link" href="/admin/pemagang">Hapus filter</Link><Link className="button button-dark button-small" href={exportUrl("xlsx")}>Export hasil filter (.xlsx)</Link><Link className="text-link" href={exportUrl("csv")}>CSV</Link><Link className="button button-dark button-small" href="/admin/pemagang/baru">Tambah pemagang</Link></div>
        </form>
        {(invalidFilter || invalidDivision) && <p className="form-message error" role="alert">Filter tidak valid. Periksa kembali rentang tanggal dan pilihan filter.</p>}
        {unavailable ? <p className="form-message error" role="alert">Data pemagang tidak dapat dimuat. Pastikan migrasi database Tugas B1 telah dijalankan.</p> : <>
          {!invalidFilter && !invalidDivision && <p className="results-count">{total === 0 ? "0 pemagang ditemukan." : `Menampilkan ${Math.min((currentPage - 1) * pageSize + 1, total)}–${Math.min(currentPage * pageSize, total)} dari ${total} pemagang.`}</p>}
          {invalidFilter || invalidDivision ? null : applicants.length === 0 ? <p className="form-message">Tidak ada data yang cocok dengan filter.</p> : <>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Nama</th><th>NIM</th><th>Asal kampus</th><th>Divisi</th><th>Jadwal</th><th>Status</th><th>Fase</th><th>Aksi</th></tr></thead><tbody>{applicants.map((applicant) => {
            const phaseValue = fasePemagang(applicant.status, applicant.tanggal_mulai, applicant.tanggal_selesai);
            return <tr key={applicant.id}><td><strong>{applicant.nama}</strong></td><td>{applicant.nim}</td><td>{applicant.asal_kampus}</td><td>{applicant.divisi?.nama ?? "—"}</td><td>{formatDate(applicant.tanggal_mulai)}<br />s.d. {formatDate(applicant.tanggal_selesai)}</td><td><span className="status-pill">{statusLabels[applicant.status]}</span></td><td>{phaseValue ? phaseLabels[phaseValue] : "—"}</td><td><Link className="text-link" href={`/admin/pemagang/${applicant.id}`}>Detail ↗</Link></td></tr>;
          })}</tbody></table></div>
          <nav className="pagination" aria-label="Halaman daftar pemagang">
            <span>Halaman {currentPage} dari {pageCount}</span>
            <div>{currentPage > 1 && <Link className="button button-dark button-small" href={pageUrl(currentPage - 1)}>Sebelumnya</Link>}{currentPage < pageCount && <Link className="button button-dark button-small" href={pageUrl(currentPage + 1)}>Berikutnya</Link>}</div>
          </nav>
          </>}
        </>}
      </section>
      <footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
    </main>
  );
}
