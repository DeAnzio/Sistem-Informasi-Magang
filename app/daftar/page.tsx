import RegistrationForm from "./registration-form";
import PublicLayout from "@/components/public-layout";

export const dynamic = "force-dynamic";

export default function DaftarPage() {
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const recaptchaSecretConfigured = Boolean(process.env.RECAPTCHA_SECRET_KEY);
  return (
    <PublicLayout activePath="/daftar" title="Pendaftaran Magang">
      <section className="public-container public-content">
        <div className="public-page-intro"><p>Lengkapi data berikut dengan informasi yang benar serta tanggal mulai dan selesai magang. Penempatan divisi akan ditentukan oleh administrator setelah pendaftaran diperiksa.</p></div>
        {!recaptchaSiteKey || !recaptchaSecretConfigured ? <div className="form-message error">Formulir belum tersedia karena kunci reCAPTCHA belum dikonfigurasi. Silakan hubungi administrator.</div> : <RegistrationForm recaptchaSiteKey={recaptchaSiteKey} />}
      </section>
    </PublicLayout>
  );
}
