import type { Database } from "@/lib/database.types";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import PublicLayout from "@/components/public-layout";

export const dynamic = "force-dynamic";

type DivisionCapacity = {
  divisi_id: string;
  divisi_nama: string;
  urutan: number;
  kuota: number;
  terisi: number;
  terjadwal: number;
  sisa: number;
  status: string;
};

async function getCapacity() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { divisions: [], unavailable: true };
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("get_slot_info");
  return { divisions: (data as DivisionCapacity[] | null) ?? [], unavailable: Boolean(error) };
}

export default async function SlotPage() {
  const { divisions, unavailable } = await getCapacity();
  return (
    <PublicLayout activePath="/slot" title="Informasi Kuota Magang">
      <section className="public-container public-content">
        <div className="public-page-intro"><p>Kuota menunjukkan kapasitas peserta magang yang dapat aktif bersamaan pada setiap divisi. Jumlah terisi menggambarkan peserta yang sedang magang hari ini; ketersediaan untuk tanggal yang Anda pilih akan diperiksa saat pendaftaran.</p></div>
        {unavailable ? <div className="form-message error">Informasi kuota belum dapat dimuat. Pastikan fungsi `get_slot_info` sudah tersedia pada Supabase.</div> : divisions.length === 0 ? <div className="form-message">Belum ada divisi aktif.</div> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Divisi</th><th>Kapasitas</th><th>Sedang magang</th><th>Akan datang</th><th>Sisa saat ini</th><th>Status</th><th></th></tr></thead><tbody>{divisions.map((division) => (
            <tr key={division.divisi_id}>
              <td><strong>{division.divisi_nama}</strong></td>
              <td>{division.kuota}</td>
              <td>{division.terisi}</td>
              <td>{division.terjadwal}</td>
              <td>{division.sisa}</td>
              <td><span className="status-pill">{division.status === "tersedia" ? "Tersedia" : "Penuh"}</span></td>
              <td><Link className="text-link" href={`/daftar?divisi=${division.divisi_id}`}>Daftar ↗</Link></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>
    </PublicLayout>
  );
}
