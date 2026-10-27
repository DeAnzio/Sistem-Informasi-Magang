import AdminLayout from "@/components/admin-layout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ManualApplicantForm from "./manual-form";

export const dynamic = "force-dynamic";

export default async function ManualApplicantPage() {
  const result = await (async () => {
    try {
      const supabase = await createSupabaseServerClient();
      return await supabase.from("divisi").select("id, nama").eq("aktif", true).order("urutan");
    } catch { return { data: null, error: new Error("Layanan tidak tersedia.") }; }
  })();
  const { data: divisions, error } = result;
  return (
    <AdminLayout backHref="/admin/pemagang" backLabel="Kembali ke daftar pemagang">
      <div className="page-head">
        <p className="eyebrow">INPUT OLEH ADMIN</p>
        <h1>Tambah pemagang</h1>
        <p>Catat peserta magang yang datang langsung atau data yang perlu dimasukkan oleh administrator.</p>
      </div>
      {error ? (
        <p className="form-message error">Daftar divisi tidak dapat dimuat. Pastikan skema dan migrasi database telah dijalankan.</p>
      ) : !divisions?.length ? (
        <p className="form-message">Tidak ada divisi aktif.</p>
      ) : (
        <ManualApplicantForm divisions={divisions} />
      )}
    </AdminLayout>
  );
}
