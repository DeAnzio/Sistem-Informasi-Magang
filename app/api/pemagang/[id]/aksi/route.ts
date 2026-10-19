import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendApplicantEmail, type ApplicantEmailType } from "@/lib/email";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("aksi", [
  z.object({
    aksi: z.literal("terima"),
    kirimEmail: z.boolean().default(true),
  }).strict(),
  z.object({
    aksi: z.literal("tolak"),
    catatan: z.string().trim().max(500).default(""),
    kirimEmail: z.boolean().default(true),
  }).strict(),
  z.object({
    aksi: z.literal("batalkan"),
    catatan: z.string().trim().min(3).max(500),
    kirimEmail: z.boolean().default(true),
  }).strict(),
  z.object({
    aksi: z.literal("ubah_jadwal"),
    tanggalMulai: z.iso.date(),
    tanggalSelesai: z.iso.date(),
    kirimEmail: z.boolean().default(true),
  }).strict().refine(({ tanggalMulai, tanggalSelesai }) => {
    const duration = (Date.parse(`${tanggalSelesai}T00:00:00Z`) - Date.parse(`${tanggalMulai}T00:00:00Z`)) / 86_400_000;
    return duration > 0 && duration <= 366;
  }, { path: ["tanggalSelesai"], message: "Tanggal selesai harus setelah tanggal mulai dan durasi maksimal 366 hari." }),
]);

const rpcErrors: Record<string, { status: number; message: string }> = {
  kuota_penuh: { status: 409, message: "Divisi penuh pada tanggal tersebut." },
  sudah_diproses: { status: 409, message: "Pendaftar sudah diverifikasi." },
  status_tidak_valid: { status: 409, message: "Aksi tidak tersedia untuk status ini." },
  jadwal_duplikat: { status: 409, message: "Pemagang ini sudah memiliki jadwal dengan tanggal mulai yang sama." },
  tanggal_tidak_valid: { status: 422, message: "Rentang tanggal tidak valid." },
  tidak_ditemukan: { status: 404, message: "Data pemagang tidak ditemukan." },
};

export async function POST(
  request: Request,
  context: RouteContext<"/api/pemagang/[id]/aksi">,
) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "Asal permintaan tidak valid." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Data aksi tidak valid." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: current, error: currentError } = await supabase
      .from("applicants")
      .select("status, tanggal_mulai, tanggal_selesai")
      .eq("id", id)
      .maybeSingle();
    if (currentError) {
      console.error("Gagal membaca status pemagang sebelum aksi.", { message: currentError.message });
      return Response.json({ error: "Status pemagang belum dapat diperiksa." }, { status: 503 });
    }
    if (!current) return Response.json({ error: "Data pemagang tidak ditemukan." }, { status: 404 });

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

    let emailType: ApplicantEmailType | null = null;
    switch (parsed.data.aksi) {
      case "terima":
        emailType = "diterima";
        break;
      case "tolak":
        emailType = "ditolak";
        break;
      case "batalkan":
        emailType = "dibatalkan";
        break;
      case "ubah_jadwal":
        if (current.status === "diterima") emailType = "jadwal_diubah";
        break;
    }

    let emailSent: boolean | null = null;
    let emailMessage: string | undefined;
    if (emailType && parsed.data.kirimEmail) {
      try {
        const scheduleBefore = parsed.data.aksi === "ubah_jadwal"
          ? { tanggalMulai: current.tanggal_mulai, tanggalSelesai: current.tanggal_selesai }
          : null;
        const email = await sendApplicantEmail(id, emailType, scheduleBefore);
        emailSent = email.sent;
        if (!email.sent || !email.logged) {
          emailMessage = email.message ?? "Status email belum dapat dipastikan.";
        }
      } catch {
        emailSent = false;
        emailMessage = "Aksi berhasil, tetapi email belum dapat diproses. Periksa riwayat email.";
        console.error("Pengiriman email setelah aksi pemagang gagal.");
      }
    }

    return Response.json({ result: "ok", emailSent, emailMessage });
  } catch {
    return Response.json({ error: "Layanan aksi pemagang belum tersedia." }, { status: 503 });
  }
}
