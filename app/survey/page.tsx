import Link from "next/link";
import PublicLayout from "@/components/public-layout";

export default function SurveyPage() {
  return (
    <PublicLayout activePath="/survey" title="Survey Kepuasan Pengguna Layanan Magang">
      <article className="public-container public-content survey-page">
        <div className="survey-illustration-placeholder" aria-label="Placeholder ilustrasi survey">
          Tempat ilustrasi survey
        </div>
        <div className="survey-letter">
          <p>Yth. Pengguna Layanan Magang,</p>
          <p>Terima kasih telah memilih layanan magang/praktek kerja lapangan BPN D.I. Yogyakarta sebagai bagian dari proses pembelajaran Anda.</p>
          <p>Kami terus berupaya meningkatkan mutu layanan, mulai dari proses pengajuan hingga pendampingan selama kegiatan berlangsung. Masukan Anda membantu kami memahami hal-hal yang sudah berjalan baik dan yang masih perlu ditingkatkan.</p>
          <p>Partisipasi dalam survey ini sangat berarti. Jawaban akan digunakan untuk evaluasi layanan dan dijaga kerahasiaannya.</p>
          <p>Terima kasih atas waktu dan kontribusi Anda.</p>
          <p>Hormat kami,<br />Pengelola Layanan Magang<br />BPN D.I. Yogyakarta</p>
        </div>
        <div className="survey-cta-panel" id="survey-form">
          <h2>Bagikan pengalaman Anda</h2>
          <p>Tautan formulir Survey Kepuasan akan disediakan oleh pengelola layanan.</p>
          <Link className="public-button" href="/kontak">Hubungi pengelola layanan <span aria-hidden="true">→</span></Link>
        </div>
      </article>
    </PublicLayout>
  );
}
