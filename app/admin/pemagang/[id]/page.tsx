import AdminLayout from "@/components/admin-layout";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import ApplicantActions from "./applicant-actions";
import { fasePemagang } from "@/lib/tanggal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/normalize-relation";
import type { ApplicantStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pending", "diterima", "ditolak", "dibatalkan"]);
const statusLabels: Record<ApplicantStatus, string> = {
  pending: "Menunggu verifikasi",
  diterima: "Diterima",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
};
const phaseLabels = {
  akan_datang: "Akan datang",
  aktif: "Aktif",
  selesai: "Selesai",
} as const;
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && z.iso.date().safeParse(value).success;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function dateDuration(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function activityDescription(action: string, rawDetail: unknown): string {
  const detail = typeof rawDetail === "object" && rawDetail !== null && !Array.isArray(rawDetail)
    ? rawDetail as Record<string, unknown>
    : {};
  if (action === "ubah_jadwal") {
    const oldRange = detail.dari as Record<string, unknown> | undefined;
    const newRange = detail.ke as Record<string, unknown> | undefined;
    if (isIsoDate(oldRange?.mulai) && isIsoDate(oldRange.selesai) &&
        isIsoDate(newRange?.mulai) && isIsoDate(newRange.selesai)) {
      return `${formatDate(oldRange.mulai)}–${formatDate(oldRange.selesai)} → ${formatDate(newRange.mulai)}–${formatDate(newRange.selesai)}`;
    }
    return "Jadwal magang diperbarui.";
  }
  if (action === "tolak" || action === "batalkan") {
    return typeof detail.catatan === "string" && detail.catatan
      ? `Catatan: ${detail.catatan}`
      : action === "batalkan" ? "Kegiatan magang dibatalkan." : "Pendaftaran ditolak.";
  }
  if (action === "unduh_berkas") {
    return typeof detail.jenis === "string" ? `Jenis berkas: ${detail.jenis}.` : "Berkas diakses.";
  }
  const descriptions: Record<string, string> = {
    input_manual: "Data pemagang dicatat secara manual.",
    terima: "Pendaftaran diterima.",
    ubah_divisi: "Divisi penempatan diperbarui.",
  };
  return descriptions[action] ?? "Aktivitas tercatat.";
}

export default async function DetailPemagangPage({
  params,
  searchParams,
}: PageProps<"/admin/pemagang/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return <main className="admin-shell"><section className="page-main shell"><p className="form-message error" role="alert">Layanan data pemagang belum tersedia.</p><Link className="text-link" href="/admin/pemagang">Kembali ke daftar pemagang</Link></section></main>;
  }
  const { data, error } = await supabase
    .from("applicants")
    .select("id, nama, email, no_hp, asal_kampus, jurusan, nim, divisi_id, tanggal_mulai, tanggal_selesai, status, sumber, created_at, berkas_cv, berkas_surat_pengantar, catatan_admin, dibatalkan_at, catatan_batal, verified_by, divisi:divisi(nama)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return <main className="admin-shell"><section className="page-main shell"><p className="form-message error" role="alert">Data pemagang belum dapat dimuat. Pastikan migrasi fondasi database telah dijalankan.</p><Link className="text-link" href="/admin/pemagang">Kembali ke daftar pemagang</Link></section></main>;
  }
  if (!data) notFound();

  const statusResult = statusSchema.safeParse(data.status);
  if (!statusResult.success) notFound();
  const applicant = {
    ...data,
    status: statusResult.data,
    divisi: firstRelation<{ nama: string }>(data.divisi),
  };
  const { data: activeDivisions, error: divisionsError } = await supabase
    .from("divisi")
    .select("id, nama")
    .eq("aktif", true)
    .order("urutan");
  const actionDivisions = (activeDivisions ?? []).map((division) => ({ ...division, aktif: true }));
  if (applicant.divisi_id && !actionDivisions.some((division) => division.id === applicant.divisi_id)) {
    actionDivisions.unshift({
      id: applicant.divisi_id,
      nama: applicant.divisi?.nama ?? "Divisi tidak aktif",
      aktif: false,
    });
  }
  const phase = fasePemagang(applicant.status, applicant.tanggal_mulai, applicant.tanggal_selesai);
  const noticeType = z.enum(["kuota_penuh", "riwayat_gagal", "terima_gagal"])
    .safeParse(Array.isArray(query.hasil) ? query.hasil[0] : query.hasil);
  const noticeMessages = {
    kuota_penuh: "Data tersimpan sebagai pending karena divisi penuh pada tanggal tersebut.",
    riwayat_gagal: "Data tersimpan sebagai pending, tetapi riwayat aktivitas belum tercatat.",
    terima_gagal: "Data tersimpan sebagai pending karena status diterima belum dapat diproses.",
  };
  const { data: activityRows, error: activitiesError } = await supabase
    .from("aktivitas_pendaftar")
    .select("id, aksi, detail, oleh, waktu")
    .eq("applicant_id", id)
    .order("waktu", { ascending: false }).order("id");
  const activities = activityRows ?? [];
  const adminIds = Array.from(new Set([
    applicant.verified_by,
    ...activities.map((activity) => activity.oleh),
  ].filter((adminId): adminId is string => typeof adminId === "string")));
  const adminNames = new Map<string, string>();
  let adminNamesUnavailable = false;
  if (adminIds.length) {
    try {
      const { data: admins, error: adminsError } = await createSupabaseAdminClient()
        .from("admins")
        .select("user_id, nama")
        .in("user_id", adminIds);
      if (adminsError) {
        adminNamesUnavailable = true;
        console.error("Gagal memuat nama admin untuk detail pemagang.", { message: adminsError.message });
      } else {
        for (const admin of admins ?? []) adminNames.set(admin.user_id, admin.nama);
      }
    } catch {
      adminNamesUnavailable = true;
      console.error("Layanan direktori admin belum tersedia.");
    }
  }

  return (
    <AdminLayout backHref="/admin/pemagang" backLabel="Kembali ke daftar pemagang">
        <div className="page-head"><p className="eyebrow">DETAIL PEMAGANG</p><h1>{applicant.nama}</h1><div className="badge-row"><span className="status-pill">{statusLabels[applicant.status]}</span>{phase && <span className="status-pill">{phaseLabels[phase]}</span>}<span className="status-pill">{applicant.sumber === "manual" ? "Input manual" : "Pendaftaran online"}</span></div></div>
        {noticeType.success && <p className={`form-message${noticeType.data === "riwayat_gagal" ? " error" : ""}`} role={noticeType.data.includes("gagal") ? "alert" : "status"}>{noticeMessages[noticeType.data]}</p>}

        <section className="admin-detail-section"><h2>Biodata</h2><dl className="detail-grid">
          <div><dt>Email</dt><dd>{applicant.email}</dd></div><div><dt>Nomor HP</dt><dd>{applicant.no_hp}</dd></div>
          <div><dt>Asal kampus</dt><dd>{applicant.asal_kampus}</dd></div><div><dt>Jurusan</dt><dd>{applicant.jurusan}</dd></div>
          <div><dt>NIM</dt><dd>{applicant.nim}</dd></div><div><dt>Tanggal daftar</dt><dd>{formatTimestamp(applicant.created_at)}</dd></div>
        </dl></section>

        <section className="admin-detail-section"><h2>Penempatan</h2><dl className="detail-grid">
          <div><dt>Divisi</dt><dd>{applicant.divisi?.nama ?? "Belum ditetapkan"}</dd></div>
          <div><dt>Tanggal mulai</dt><dd>{formatDate(applicant.tanggal_mulai)}</dd></div>
          <div><dt>Tanggal selesai</dt><dd>{formatDate(applicant.tanggal_selesai)}</dd></div>
          <div><dt>Durasi</dt><dd>{dateDuration(applicant.tanggal_mulai, applicant.tanggal_selesai)} hari</dd></div>
          {applicant.verified_by && <div><dt>Diverifikasi oleh</dt><dd>{adminNames.get(applicant.verified_by) ?? "Admin"}</dd></div>}
          {applicant.status === "ditolak" && applicant.catatan_admin && <div className="detail-wide"><dt>Alasan penolakan</dt><dd>{applicant.catatan_admin}</dd></div>}
          {applicant.status === "dibatalkan" && <><div><dt>Tanggal pembatalan</dt><dd>{applicant.dibatalkan_at ? formatTimestamp(applicant.dibatalkan_at) : "—"}</dd></div><div className="detail-wide"><dt>Alasan pembatalan</dt><dd>{applicant.catatan_batal || "—"}</dd></div></>}
        </dl></section>

        <section className="admin-detail-section"><h2>Berkas</h2><div className="document-actions">
          {([["cv", "CV", applicant.berkas_cv], ["surat", "Surat pengantar", applicant.berkas_surat_pengantar]] as const).map(([type, label, file]) => <div className="document-action" key={type}><strong>{label}</strong>{file ? <div><a className="text-link" href={`/api/berkas/${id}/${type}`} target="_blank" rel="noreferrer">Lihat ↗</a><a className="text-link" href={`/api/berkas/${id}/${type}?aksi=unduh`}>Unduh ↓</a></div> : <span>Belum ada berkas</span>}</div>)}
        </div></section>

        <section className="admin-detail-section"><h2>Aksi</h2>{applicant.status === "ditolak" || applicant.status === "dibatalkan" ? <p className="form-message">Status final. Tidak ada aksi lanjutan.</p> : <ApplicantActions id={id} status={applicant.status} tanggalMulai={applicant.tanggal_mulai} tanggalSelesai={applicant.tanggal_selesai} divisiId={applicant.divisi_id} divisions={actionDivisions} divisionsUnavailable={Boolean(divisionsError)} />}</section>

        <section className="admin-detail-section"><h2>Riwayat aktivitas</h2>{activitiesError ? <p className="form-message error" role="alert">Riwayat aktivitas tidak dapat dimuat. Pastikan migrasi fondasi database telah dijalankan.</p> : activities.length === 0 ? <p className="form-message">Belum ada riwayat aktivitas.</p> : <ol className="activity-list">{activities.map((activity) => <li key={activity.id}><strong>{activity.aksi.replaceAll("_", " ")}</strong><p>{activityDescription(activity.aksi, activity.detail)}</p><small>{(activity.oleh && adminNames.get(activity.oleh)) || "Admin"} · {formatTimestamp(activity.waktu)}</small></li>)}</ol>}{adminNamesUnavailable && <p className="form-message error" role="alert">Nama admin pada riwayat belum dapat dimuat.</p>}</section>

      </AdminLayout>
  );
}
