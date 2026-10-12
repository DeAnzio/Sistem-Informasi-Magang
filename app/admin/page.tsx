import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const counts = { pending: 0, diterima: 0, ditolak: 0 };
  let unavailable = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("applicants").select("status");
    if (error) unavailable = true;
    else for (const applicant of data ?? []) counts[applicant.status as keyof typeof counts] += 1;
  } catch {
    unavailable = true;
  }

  return (
    <main className="admin-shell">
      <div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href="/">Lihat portal publik <span aria-hidden="true">↗</span></Link></div></div>
      <header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link><nav><form action="/api/admin/logout" method="post"><button className="button button-dark button-small" type="submit">Keluar</button></form></nav></header>
      <section className="page-main shell">
        <div className="page-head"><p className="eyebrow">RINGKASAN</p><h1>Dashboard admin</h1><p>Pantau pendaftaran masuk dan kelola proses verifikasi peserta permagangan.</p></div>
        {unavailable && <p className="form-message error">Data belum tersedia. Pastikan skema database sudah dijalankan dan akun Anda terdaftar sebagai admin.</p>}
        <div className="path-grid"><div className="path-item"><span className="path-index">01</span><span className="path-content"><strong>{counts.pending} menunggu verifikasi</strong><small>Pendaftar yang perlu ditinjau.</small></span></div><div className="path-item"><span className="path-index">02</span><span className="path-content"><strong>{counts.diterima} diterima</strong><small>Peserta yang telah dikonfirmasi.</small></span></div><div className="path-item"><span className="path-index">03</span><span className="path-content"><strong>{counts.ditolak} ditolak</strong><small>Pendaftaran yang tidak dilanjutkan.</small></span></div></div>
        <div className="intro-actions" style={{ marginTop: 28 }}><Link className="button button-green" href="/admin/verifikasi">Buka verifikasi <span aria-hidden="true">→</span></Link><Link className="button button-dark" href="/admin/slot">Kelola kuota <span aria-hidden="true">→</span></Link><Link className="text-link" href="/admin/pemagang/baru">Tambah peserta manual ↗</Link></div>
      </section>
      <footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
    </main>
  );
}
