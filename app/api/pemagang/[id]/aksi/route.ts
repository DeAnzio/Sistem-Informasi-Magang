import { hasValidOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applicantActionSchema } from "@/lib/applicant-action-schema";

export const runtime = "nodejs";

const rpcErrors: Record<string, { status: number; message: string }> = {
  kuota_penuh: { status: 409, message: "Divisi penuh pada tanggal tersebut." },
  sudah_diproses: { status: 409, message: "Pendaftar sudah diverifikasi." },
  status_tidak_valid: { status: 409, message: "Aksi tidak tersedia untuk status ini." },
  jadwal_duplikat: { status: 409, message: "Pemagang ini sudah memiliki jadwal dengan tanggal mulai yang sama." },
  tanggal_tidak_valid: { status: 422, message: "Rentang tanggal tidak valid." },
  divisi_belum_dipilih: { status: 422, message: "Pilih divisi peserta sebelum menerima pendaftaran." },
  divisi_tidak_tersedia: { status: 409, message: "Divisi tidak tersedia untuk penempatan." },
  tidak_ditemukan: { status: 404, message: "Data pemagang tidak ditemukan." },
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/pemagang/[id]/aksi">,
) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  if (!hasValidOrigin(request)) return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = applicantActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Data aksi tidak valid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: current, error: currentError } = await supabase
      .from("applicants")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (currentError) {
      console.error("Gagal membaca status pemagang sebelum aksi.", { message: currentError.message });
      return Response.json({ error: "Status pemagang belum dapat diperiksa." }, { status: 503 });
    }
    if (!current) return Response.json({ error: "Data pemagang tidak ditemukan." }, { status: 404 });

    if (parsed.data.aksi === "ubah_divisi") {
      const { data: result, error } = await supabase.rpc("ubah_divisi_pendaftar", {
        p_id: id, p_admin: adminId, p_divisi: parsed.data.divisiId,
      });
      if (error) return Response.json({ error: "Divisi belum dapat disimpan." }, { status: 503 });
      if (result !== "ok") {
        const failure = rpcErrors[result ?? ""];
        return Response.json({ error: failure?.message ?? "Divisi belum dapat disimpan." }, { status: failure?.status ?? 500 });
      }
      return Response.json({ result: "ok" });
    }

    let result: string | null;
    switch (parsed.data.aksi) {
      case "terima": {
        const rpc = await supabase.rpc("terima_pendaftar", { p_id: id, p_admin: adminId });
        if (rpc.error) {
          console.error("RPC terima pendaftar gagal.", { message: rpc.error.message });
          return Response.json({ error: "Aksi belum dapat disimpan." }, { status: 500 });
        }
        result = rpc.data;
        break;
      }
      case "tolak": {
        const rpc = await supabase.rpc("tolak_pendaftar", {
          p_id: id,
          p_admin: adminId,
          p_catatan: parsed.data.catatan,
        });
        if (rpc.error) {
          console.error("RPC tolak pendaftar gagal.", { message: rpc.error.message });
          return Response.json({ error: "Aksi belum dapat disimpan." }, { status: 500 });
        }
        result = rpc.data;
        break;
      }
      case "batalkan": {
        const rpc = await supabase.rpc("batalkan_pendaftar", {
          p_id: id,
          p_admin: adminId,
          p_catatan: parsed.data.catatan,
        });
        if (rpc.error) {
          console.error("RPC batalkan pendaftar gagal.", { message: rpc.error.message });
          return Response.json({ error: "Aksi belum dapat disimpan." }, { status: 500 });
        }
        result = rpc.data;
        break;
      }
      case "ubah_jadwal": {
        const rpc = await supabase.rpc("ubah_jadwal_pemagang", {
          p_id: id,
          p_admin: adminId,
          p_mulai: parsed.data.tanggalMulai,
          p_selesai: parsed.data.tanggalSelesai,
        });
        if (rpc.error) {
          console.error("RPC ubah jadwal pemagang gagal.", { message: rpc.error.message });
          return Response.json({ error: "Aksi belum dapat disimpan." }, { status: 500 });
        }
        result = rpc.data;
        break;
      }
    }

    if (result !== "ok") {
      const failure = rpcErrors[result ?? ""];
      if (failure) return Response.json({ error: failure.message, result }, { status: failure.status });
      console.error("RPC aksi pemagang mengembalikan hasil yang tidak dikenal.");
      return Response.json({ error: "Aksi belum dapat disimpan." }, { status: 500 });
    }

    return Response.json({ result: "ok" });
  } catch {
    return Response.json({ error: "Layanan aksi pemagang belum tersedia." }, { status: 503 });
  }
}
