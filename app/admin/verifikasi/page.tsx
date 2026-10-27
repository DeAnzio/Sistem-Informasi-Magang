import AdminLayout from "@/components/admin-layout";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/normalize-relation";

export const dynamic = "force-dynamic";

export default async function VerifikasiPage({ searchParams }: PageProps<"/admin/verifikasi">) {
  const params = await searchParams;
  const rawPage = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? 1);
  let page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 20;
  let total = 0;
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
    const { count, error: countError } = await supabase.from("applicants")
      .select("id", { count: "exact", head: true }).eq("status", "pending");
    if (countError || count === null) throw new Error("Jumlah pendaftar tidak tersedia.");
    total = count;
    page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const { data, error } = await supabase
      .from("applicants")
      .select("id, nama, asal_kampus, jurusan, created_at, tanggal_mulai, tanggal_selesai, divisi:divisi(nama)")
      .eq("status", "pending")
      .order("created_at").order("id").range((page - 1) * pageSize, page * pageSize - 1);
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
    <AdminLayout>
        <div className="page-head"><p className="eyebrow">TINJAU PENDAFTARAN</p><h1>Menunggu verifikasi</h1><p>{total} pendaftaran menunggu keputusan.</p></div>
        {unavailable ? <p className="form-message error" role="alert">Data pendaftar tidak dapat dimuat.</p> : applicants.length === 0 ? <p className="form-message">Tidak ada pendaftaran yang menunggu verifikasi.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Nama</th><th>Perguruan tinggi</th><th>Divisi</th><th>Periode yang diajukan</th><th>Diterima</th><th></th></tr></thead><tbody>{applicants.map((item) => <tr key={item.id}><td><strong>{item.nama}</strong></td><td>{item.asal_kampus}<br /><small>{item.jurusan}</small></td><td>{item.divisi?.nama ?? "Belum ditetapkan"}</td><td>{item.tanggal_mulai} – {item.tanggal_selesai}</td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(item.created_at))}</td><td><Link className="text-link" href={`/admin/pemagang/${item.id}`}>Tinjau ↗</Link></td></tr>)}</tbody></table></div>}
        {!unavailable && total > pageSize && <nav className="pagination" aria-label="Halaman antrean verifikasi">
          <span>Halaman {page} dari {Math.ceil(total / pageSize)}</span><div>
            {page > 1 && <Link className="button button-dark button-small" href={`/admin/verifikasi?page=${page - 1}`}>Sebelumnya</Link>}
            {page * pageSize < total && <Link className="button button-dark button-small" href={`/admin/verifikasi?page=${page + 1}`}>Berikutnya</Link>}
          </div>
        </nav>}
      </AdminLayout>
  );
}
