import { createClient } from "@supabase/supabase-js";
import RegistrationForm from "./registration-form";
import PublicLayout from "@/components/public-layout";

export const dynamic = "force-dynamic";

type Division = { id: string; nama: string };

async function getDivisions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { divisions: [], unavailable: true };
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("divisi").select("id, nama").eq("aktif", true).order("urutan");
  return { divisions: (data as Division[] | null) ?? [], unavailable: Boolean(error) };
}

export default async function DaftarPage({ searchParams }: PageProps<"/daftar">) {
  const [{ divisions, unavailable }, params] = await Promise.all([getDivisions(), searchParams]);
  const initialDivisionId = typeof params.divisi === "string" ? params.divisi : "";
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const recaptchaSecretConfigured = Boolean(process.env.RECAPTCHA_SECRET_KEY);
  return (
    <PublicLayout activePath="/daftar" title="Pendaftaran Magang">
      <section className="public-container public-content">
        <div className="public-page-intro"><p>Lengkapi data berikut dengan informasi yang benar. Tentukan divisi serta tanggal mulai dan selesai magang. Tim kami akan menghubungi alamat email yang didaftarkan.</p></div>
        {unavailable ? <div className="form-message error">Formulir belum tersedia karena layanan pendaftaran belum dikonfigurasi. Silakan hubungi administrator.</div> : divisions.length === 0 ? <div className="form-message">Belum ada divisi yang tersedia untuk pendaftaran.</div> : !recaptchaSiteKey || !recaptchaSecretConfigured ? <div className="form-message error">Formulir belum tersedia karena kunci reCAPTCHA belum dikonfigurasi. Silakan hubungi administrator.</div> : <RegistrationForm divisions={divisions} initialDivisionId={initialDivisionId} recaptchaSiteKey={recaptchaSiteKey} />}
      </section>
    </PublicLayout>
  );
}
