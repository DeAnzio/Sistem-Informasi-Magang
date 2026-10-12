import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { firstRelation } from "@/lib/normalize-relation";
import DecisionForm from "./decision-form";
import RetryEmail from "./retry-email";

export const dynamic = "force-dynamic";

type Applicant = {
  id: string;
  nama: string;
  email: string;
  no_hp: string;
  asal_kampus: string;
  jurusan: string;
  nim: string;
  divisi_id: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: string;
  created_at: string;
  berkas_cv: string | null;
  berkas_surat_pengantar: string | null;
  divisi: { nama: string } | null;
};

export default async function DetailVerifikasiPage({ params, searchParams }: PageProps<"/admin/verifikasi/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("applicants").select("id, nama, email, no_hp, asal_kampus, jurusan, nim, divisi_id, tanggal_mulai, tanggal_selesai, status, created_at, berkas_cv, berkas_surat_pengantar, divisi:divisi(nama)").eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const applicant: Applicant = {
    ...data,
    divisi: firstRelation<{ nama: string }>(data.divisi),
  };
  const storage = createSupabaseAdminClient().storage.from("berkas");
  const [cvResult, letterResult] = await Promise.all([
    applicant.berkas_cv ? storage.createSignedUrl(applicant.berkas_cv, 300) : Promise.resolve({ data: null, error: null }),
    applicant.berkas_surat_pengantar ? storage.createSignedUrl(applicant.berkas_surat_pengantar, 300) : Promise.resolve({ data: null, error: null }),
  ]);
  if (cvResult.error) console.error("Gagal membuat tautan CV untuk pendaftar.", { statusCode: cvResult.error.statusCode, message: cvResult.error.message });
  if (letterResult.error) console.error("Gagal membuat tautan surat pengantar untuk pendaftar.", { statusCode: letterResult.error.statusCode, message: letterResult.error.message });

  return (
    <main className="admin-shell"><div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href="/admin/verifikasi">Daftar verifikasi <span aria-hidden="true">↗</span></Link></div></div>
      <header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link></header>
      <section className="page-main shell"><div className="page-head"><p className="eyebrow">DETAIL PENDAFTARAN</p><h1>{applicant.nama}</h1><p>{applicant.asal_kampus} · {applicant.jurusan}</p></div>
        <div className="form-layout"><div className="path-grid" style={{ gridTemplateColumns: "1fr 1fr" }}><div className="path-item"><span className="path-content"><small>NIM</small><strong>{applicant.nim}</strong></span></div><div className="path-item"><span className="path-content"><small>Email</small><strong>{applicant.email}</strong></span></div><div className="path-item"><span className="path-content"><small>Nomor telepon</small><strong>{applicant.no_hp}</strong></span></div><div className="path-item"><span className="path-content"><small>Divisi</small><strong>{applicant.divisi?.nama}</strong></span></div><div className="path-item"><span className="path-content"><small>Tanggal magang</small><strong>{applicant.tanggal_mulai} – {applicant.tanggal_selesai}</strong></span></div><div className="path-item"><span className="path-content"><small>Berkas CV</small><strong>{cvResult.data?.signedUrl ? <a className="text-link" href={cvResult.data.signedUrl} target="_blank" rel="noreferrer">Buka berkas ↗</a> : applicant.berkas_cv ? "Berkas tidak dapat diakses. Periksa bucket Storage." : "Belum ada berkas."}</strong></span></div><div className="path-item"><span className="path-content"><small>Surat pengantar</small><strong>{letterResult.data?.signedUrl ? <a className="text-link" href={letterResult.data.signedUrl} target="_blank" rel="noreferrer">Buka berkas ↗</a> : applicant.berkas_surat_pengantar ? "Berkas tidak dapat diakses. Periksa bucket Storage." : "Belum ada berkas."}</strong></span></div></div>
          <aside className="form-aside"><h2>Keputusan</h2>{applicant.status === "pending" ? <DecisionForm id={applicant.id} /> : <><p>Status pendaftaran: {applicant.status}.</p>{query.email === "failed" && <p className="form-message error">Keputusan tersimpan, tetapi email gagal dikirim.</p>}<RetryEmail applicantId={applicant.id} /></>}</aside></div>
      </section>
      <footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
    </main>
  );
}
