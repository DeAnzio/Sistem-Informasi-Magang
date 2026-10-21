import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/normalize-relation";

export const dynamic = "force-dynamic";

export default async function VerifikasiPage() {
  let applicants: {
    id: string;
    nama: string;
    asal_kampus: string;
    jurusan: string;
    created_at: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    divisi: { nama: string } | null;
  }[] = [];
  let unavailable = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("applicants")
      .select("id, nama, asal_kampus, jurusan, created_at, tanggal_mulai, tanggal_selesai, divisi:divisi(nama)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) unavailable = true;
    else {
      applicants = (data ?? []).map((applicant) => ({
        ...applicant,
        divisi: firstRelation<{ nama: string }>(applicant.divisi),
      }));
    }
  } catch {
    unavailable = true;
  }

  return (
    <main className="admin-shell">
      <div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href="/admin">Kembali ke dashboard <span aria-hidden="true">↗</span></Link></div></div>
      <header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link></header>
      <section className="page-main shell">
        <div className="page-head"><p className="eyebrow">TINJAU PENDAFTARAN</p><h1>Menunggu verifikasi</h1><p>{applicants.length} pendaftaran menunggu keputusan.</p></div>
        {unavailable ? <p className="form-message error" role="alert">Data pendaftar tidak dapat dimuat.</p> : applicants.length === 0 ? <p className="form-message">Tidak ada pendaftaran yang menunggu verifikasi.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Nama</th><th>Perguruan tinggi</th><th>Divisi</th><th>Periode yang diajukan</th><th>Diterima</th><th></th></tr></thead><tbody>{applicants.map((item) => <tr key={item.id}><td><strong>{item.nama}</strong></td><td>{item.asal_kampus}<br /><small>{item.jurusan}</small></td><td>{item.divisi?.nama ?? "Belum ditetapkan"}</td><td>{item.tanggal_mulai} – {item.tanggal_selesai}</td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(item.created_at))}</td><td><Link className="text-link" href={`/admin/pemagang/${item.id}`}>Tinjau ↗</Link></td></tr>)}</tbody></table></div>}
      </section>
      <footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
    </main>
  );
}
