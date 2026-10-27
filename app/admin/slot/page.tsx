import AdminLayout from "@/components/admin-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SlotManager from "./slot-manager";

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

export default async function AdminSlotPage() {
  let divisions: DivisionCapacity[] = [];
  let unavailable = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_slot_info");
    if (error) unavailable = true;
    else divisions = (data as DivisionCapacity[] | null) ?? [];
  } catch {
    unavailable = true;
  }

  return (
    <AdminLayout>
        <div className="page-head"><p className="eyebrow">KAPASITAS DIVISI</p><h1>Kelola kuota magang</h1><p>Kuota adalah jumlah pemagang yang dapat aktif bersamaan di setiap divisi. Data terisi dan jadwal dihitung dari pendaftar yang telah diterima.</p></div>
        {unavailable ? <p className="form-message error">Informasi kuota tidak dapat dimuat. Pastikan fungsi `get_slot_info` tersedia pada Supabase.</p> : <SlotManager divisions={divisions} />}
      </AdminLayout>
  );
}
