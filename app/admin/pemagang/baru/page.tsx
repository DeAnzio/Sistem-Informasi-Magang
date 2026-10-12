import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ManualApplicantForm from "./manual-form";

export const dynamic = "force-dynamic";

export default async function ManualApplicantPage() {
  const supabase = await createSupabaseServerClient();
  const { data: divisions, error } = await supabase.from("divisi").select("id, nama").eq("aktif", true).order("urutan");
  return <main className="admin-shell"><div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href="/admin">Kembali ke dashboard <span aria-hidden="true">↗</span></Link></div></div><header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link></header><section className="page-main shell"><div className="page-head"><p className="eyebrow">INPUT OLEH ADMIN</p><h1>Tambah pemagang</h1><p>Catat pendaftaran yang diterima secara langsung atau melalui jalur non-daring.</p></div>{error ? <p className="form-message error">Daftar divisi tidak dapat dimuat. Pastikan database menggunakan struktur pada panduan setup.</p> : !divisions?.length ? <p className="form-message">Tidak ada divisi aktif.</p> : <ManualApplicantForm divisions={divisions} />}</section><footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer></main>;
}
