import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const applicantSchema = z.object({
  nama: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  no_hp: z.string().trim().min(8).max(30),
  asal_kampus: z.string().trim().min(2).max(160),
  jurusan: z.string().trim().min(2).max(160),
  nim: z.string().trim().min(2).max(50),
  divisi_id: z.uuid(),
  tanggal_mulai: z.iso.date(),
  tanggal_selesai: z.iso.date(),
}).refine(({ tanggal_mulai, tanggal_selesai }) => {
  const duration = (Date.parse(`${tanggal_selesai}T00:00:00Z`) - Date.parse(`${tanggal_mulai}T00:00:00Z`)) / 86_400_000;
  return duration > 0 && duration <= 366;
}, { path: ["tanggal_selesai"], message: "Tanggal selesai harus setelah tanggal mulai dan durasi maksimal 366 hari." });

export async function POST(request: Request) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });
  const form = await request.formData();
  const parsed = applicantSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return Response.json({ error: "Periksa kembali data wajib peserta." }, { status: 400 });
  try {
    const supabase = createSupabaseAdminClient();
    const { data: remainingCapacity, error: capacityError } = await supabase.rpc("sisa_kuota_rentang", {
      p_divisi: parsed.data.divisi_id,
      p_mulai: parsed.data.tanggal_mulai,
      p_selesai: parsed.data.tanggal_selesai,
    });
    if (capacityError) return Response.json({ error: "Kapasitas untuk tanggal tersebut belum dapat diperiksa." }, { status: 503 });
    if (remainingCapacity <= 0) return Response.json({ error: "Kuota divisi telah penuh pada rentang tanggal yang dipilih." }, { status: 409 });
    const { data, error } = await supabase.from("applicants").insert({ ...parsed.data, sumber: "manual" }).select("id").single();
    if (error?.code === "23505") return Response.json({ error: "NIM sudah terdaftar pada divisi dan tanggal mulai tersebut." }, { status: 409 });
    if (error || !data) return Response.json({ error: "Data peserta belum dapat disimpan." }, { status: 500 });
    return Response.json({ id: data.id }, { status: 201 });
  } catch {
    return Response.json({ error: "Layanan pemagang belum dikonfigurasi." }, { status: 503 });
  }
}
