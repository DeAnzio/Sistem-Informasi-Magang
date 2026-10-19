import Link from "next/link";
import PublicLayout from "@/components/public-layout";

export default function Home() {
  return (
    <PublicLayout activePath="/">
      <section className="landing-hero poster-hero" aria-label="Placeholder poster layanan magang">
        <div className="poster-placeholder">
          <span>Poster layanan magang</span>
          <small>Tempatkan poster di sini</small>
        </div>
      </section>

      <div className="public-container landing-content">
        <Link className="survey-banner" href="/survey">
          <span className="survey-banner-icon" aria-hidden="true">◎</span>
          <span><strong>Bantu kami meningkatkan layanan</strong><small>Sampaikan pengalaman Anda melalui Survey Kepuasan Pengguna Layanan Magang.</small></span>
          <span className="survey-banner-arrow" aria-hidden="true">↗</span>
        </Link>

        <p className="service-intro">Layanan magang merupakan kesempatan bagi siswa dan mahasiswa untuk menerapkan ilmu pengetahuan dalam situasi kerja nyata, sekaligus mengenal proses pelayanan pertanahan di lingkungan BPN D.I. Yogyakarta.</p>

        <section className="info-section" aria-labelledby="requirements-title">
          <h2 id="requirements-title">A. Persyaratan Magang/Praktek Kerja Lapangan</h2>
          <ol>
            <li>Mengajukan surat permohonan resmi dari lembaga pendidikan.</li>
            <li>Berstatus sebagai siswa atau mahasiswa aktif selama masa magang.</li>
            <li>Mengikuti program sekurang-kurangnya 1 bulan dan paling lama 12 bulan.</li>
            <li>Memperoleh penempatan sesuai formasi dan ketersediaan kuota.</li>
            <li>Bersedia menaati ketentuan dan menandatangani <Link href="#documents-title">Pakta Integritas</Link>.</li>
          </ol>
        </section>

        <section className="info-section" aria-labelledby="documents-title">
          <h2 id="documents-title">B. Dokumen yang harus disiapkan</h2>
          <ol>
            <li>Surat permohonan dari lembaga pendidikan yang memuat:
              <ul>
                <li>nama, NIM/NIS, dan program studi;</li>
                <li>bidang atau unit tujuan;</li>
                <li>periode magang yang diajukan;</li>
                <li>nama dosen/guru penanggung jawab; dan</li>
                <li>kontak yang dapat dihubungi.</li>
              </ul>
            </li>
            <li>Daftar riwayat hidup dan dokumen pendukung dari peserta.</li>
            <li>Pakta Integritas yang telah ditandatangani sesuai arahan petugas.</li>
          </ol>
        </section>

        <section className="info-section" aria-labelledby="steps-title">
          <h2 id="steps-title">C. Tahapan Pengajuan</h2>
          <ol>
            <li>Lembaga pendidikan mengirimkan surat permohonan.</li>
            <li>Petugas memeriksa kelengkapan dan ketersediaan formasi.</li>
            <li>Hasil pemeriksaan disampaikan melalui kanal kontak pemohon.</li>
            <li>Peserta memperoleh pembimbing dan penempatan unit kerja.</li>
            <li>Peserta mengikuti kegiatan magang sesuai jadwal dan tata tertib.</li>
            <li>Peserta menyusun laporan dan mempresentasikan hasil magang.</li>
            <li>Surat keterangan diberikan setelah seluruh kewajiban diselesaikan.</li>
          </ol>
          <div className="process-illustration" role="img" aria-label="Placeholder infografis tahapan pengajuan magang">
            Tempat infografis tahapan pengajuan magang
          </div>
        </section>

        <section className="info-section">
          <h2>D. Standar Pelayanan dan Standar Prosedur Operasional</h2>
          <ol>
            <li>Standar Pelayanan Magang/Praktek Kerja Lapangan dapat dilihat <Link href="/ketentuan">di sini</Link>.</li>
            <li>Standar Prosedur Operasional dapat diminta melalui petugas pengelola magang.</li>
          </ol>
        </section>

        <section className="info-section">
          <h2>Alamat Pengiriman Surat Permohonan</h2>
          <ol>
            <li>Surat dapat disampaikan langsung ke Kantor Wilayah BPN D.I. Yogyakarta.</li>
            <li>Pengiriman melalui email mengikuti alamat resmi yang tercantum pada halaman <Link href="/kontak">Kontak Kami</Link>.</li>
          </ol>
          <p className="content-note">Mohon konfirmasi alamat lengkap dan kanal pengiriman resmi kepada instansi sebelum mengirimkan dokumen.</p>
        </section>

        <section className="info-section questions-panel">
          <h2>Ada pertanyaan?</h2>
          <p><em>Silakan hubungi petugas pengelola magang melalui informasi pada halaman <Link href="/kontak">Kontak Kami</Link>.</em></p>
        </section>
      </div>
    </PublicLayout>
  );
}
