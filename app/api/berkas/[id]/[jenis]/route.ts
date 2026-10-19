import { z } from "zod";
import { getAuthenticatedAdminId } from "@/lib/supabase/authorize-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const fileTypeSchema = z.enum(["cv", "surat"]);

function safeFilenamePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Pemagang";
}

function safeFileExtension(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension && ["pdf", "jpg", "jpeg", "png"].includes(extension) ? extension : "bin";
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/berkas/[id]/[jenis]">,
) {
  const adminId = await getAuthenticatedAdminId().catch(() => null);
  if (!adminId) return Response.json({ error: "Tidak memiliki akses administrator." }, { status: 401 });

  const { id, jenis: rawJenis } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "ID pendaftar tidak valid." }, { status: 400 });
  }
  const jenisResult = fileTypeSchema.safeParse(rawJenis);
  if (!jenisResult.success) return Response.json({ error: "Jenis berkas tidak valid." }, { status: 400 });
  const jenis = jenisResult.data;

  try {
    const supabase = createSupabaseAdminClient();
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("nama, berkas_cv, berkas_surat_pengantar")
      .eq("id", id)
      .maybeSingle();

    if (applicantError) {
      console.error("Gagal membaca berkas pendaftar untuk admin.", { message: applicantError.message });
      return Response.json({ error: "Data berkas belum dapat dimuat." }, { status: 503 });
    }
    if (!applicant) return Response.json({ error: "Data pendaftar tidak ditemukan." }, { status: 404 });

    const path = jenis === "cv" ? applicant.berkas_cv : applicant.berkas_surat_pengantar;
    if (!path) return Response.json({ error: "Berkas belum tersedia." }, { status: 404 });

    const download = new URL(request.url).searchParams.get("aksi") === "unduh";
    const filePrefix = jenis === "cv" ? "CV" : "Surat_Pengantar";
    const filename = `${filePrefix}_${safeFilenamePart(applicant.nama)}.${safeFileExtension(path)}`;
    const { data: signedFile, error: signedUrlError } = await supabase.storage
      .from("berkas")
      .createSignedUrl(path, 60, download ? { download: filename } : undefined);

    if (signedUrlError || !signedFile) {
      console.error("Gagal membuat signed URL berkas pendaftar.", {
        statusCode: signedUrlError?.statusCode,
        message: signedUrlError?.message,
      });
      return Response.json({ error: "Berkas belum dapat dibuka. Silakan coba kembali." }, { status: 503 });
    }

    const { error: activityError } = await supabase.from("aktivitas_pendaftar").insert({
      applicant_id: id,
      aksi: "unduh_berkas",
      detail: { jenis },
      oleh: adminId,
    });
    if (activityError) {
      console.error("Gagal mencatat akses berkas pendaftar.", { message: activityError.message });
      return Response.json({ error: "Akses berkas belum dapat dicatat. Silakan coba kembali." }, { status: 503 });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: signedFile.signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    console.error("Layanan unduh berkas belum tersedia.");
    return Response.json({ error: "Layanan unduh berkas belum tersedia." }, { status: 503 });
  }
}
