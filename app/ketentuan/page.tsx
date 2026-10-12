import Link from "next/link";
import PublicLayout from "@/components/public-layout";

export default function KetentuanPage() {
  return (
    <PublicLayout activePath="/ketentuan" title="Ketentuan Magang/Praktek Kerja Lapangan">
      <article className="public-container long-document">
        <section className="info-section">
          <h2>A. Kegiatan Magang</h2>
          <ol>
            <li>Peserta mengikuti kegiatan sesuai tujuan pembelajaran yang disampaikan lembaga pendidikan.</li>
            <li>Peserta ditempatkan pada unit kerja berdasarkan kebutuhan dan ketersediaan pembimbing.</li>
            <li>Peserta wajib mematuhi arahan pembimbing dan menjaga etika selama berada di lingkungan kantor.</li>
            <li>Peserta menjaga kerahasiaan data dan informasi yang diperoleh selama kegiatan.</li>
            <li>Peserta menggunakan tanda pengenal dan berpakaian rapi sesuai ketentuan kantor.</li>
            <li>Peserta menggunakan fasilitas kantor secara bertanggung jawab.</li>
            <li>Peserta menyampaikan kendala pelaksanaan kepada pembimbing atau petugas pengelola.</li>
            <li>Pada akhir kegiatan, peserta menyelesaikan laporan yang mencakup:
              <ul><li>uraian kegiatan dan pembelajaran yang diperoleh;</li><li>presentasi laporan kepada pembimbing atau unit kerja; dan</li><li>pengunggahan laporan melalui mekanisme yang diinformasikan petugas.</li></ul>
            </li>
            <li>Surat keterangan magang dapat diproses setelah:
              <ul><li>masa kegiatan selesai;</li><li>laporan dan presentasi telah diselesaikan; dan</li><li>peserta mengembalikan tanda pengenal serta menyelesaikan administrasi.</li></ul>
            </li>
          </ol>
        </section>
        <section className="info-section">
          <h2>B. Hak dan Kewajiban</h2>
          <ol>
            <li>Instansi
              <ul><li><strong>Kewajiban</strong><ul><li>Memberikan arahan kegiatan sesuai penempatan dan kapasitas unit kerja.</li><li>Menunjuk pembimbing atau petugas penghubung selama program berlangsung.</li></ul></li><li><strong>Hak</strong><ul><li>Meminta peserta menaati ketentuan kantor dan menjaga kerahasiaan informasi.</li><li>Menghentikan kegiatan apabila terjadi pelanggaran ketentuan.</li></ul></li></ul>
            </li>
            <li>Peserta
              <ul><li><strong>Kewajiban</strong><ul><li>Melaksanakan kegiatan dengan disiplin, sopan, dan bertanggung jawab.</li><li>Menyelesaikan laporan serta tugas yang disepakati bersama pembimbing.</li></ul></li><li><strong>Hak</strong><ul><li>Mendapatkan bimbingan dan informasi yang diperlukan untuk kegiatan magang.</li><li>Mendapatkan surat keterangan setelah memenuhi persyaratan penyelesaian.</li></ul></li></ul>
            </li>
          </ol>
        </section>
        <section className="info-section">
          <h2>C. Tata Tertib</h2>
          <h3>1. Umum</h3>
          <ul><li>Menjaga nama baik lembaga pendidikan dan instansi.</li><li>Mengikuti aturan keamanan, keselamatan, dan ketertiban kantor.</li><li>Tidak menyebarluaskan dokumen atau data kedinasan tanpa izin.</li></ul>
          <h3>2. Kehadiran</h3>
          <ul><li>Hadir sesuai jadwal yang telah disepakati dengan pembimbing.</li><li>Menginformasikan ketidakhadiran atau keterlambatan kepada pembimbing.</li></ul>
          <h3>3. Tambahan</h3>
          <ul><li>Penggunaan perangkat dan akses kantor harus mendapat izin petugas.</li><li>Pelanggaran dapat ditindaklanjuti melalui:
            <ul><li>teguran lisan atau tertulis;</li><li>pemberitahuan kepada lembaga pendidikan; atau</li><li>pengakhiran kegiatan magang sesuai hasil evaluasi.</li></ul>
          </li></ul>
        </section>
        <section className="info-section">
          <h2>D. Fasilitas</h2>
          <ol><li>Peserta memperoleh arahan terkait tugas dan lingkungan kerja.</li><li>Fasilitas kerja diberikan sesuai ketersediaan dan kebijakan unit penempatan.</li><li>Surat keterangan dapat diberikan setelah kewajiban kegiatan dipenuhi.</li></ol>
        </section>
        <section className="info-section">
          <h2>E. Kuota</h2>
          <p>Penerimaan peserta menyesuaikan ketersediaan pembimbing, unit kerja, dan kuota pada periode yang berjalan. Informasi kuota dapat diperiksa pada halaman <Link href="/slot">Informasi Kuota Magang</Link>.</p>
        </section>
        <section className="info-section">
          <h2>F. Lain-lain</h2>
          <p>Informasi layanan: <Link href="/">Pelayanan Magang BPN D.I. Yogyakarta</Link>.</p>
          <p>Pengelola: petugas pengelola magang pada unit kerja terkait.</p>
          <p>Kontak: silakan lihat halaman <Link href="/kontak">Kontak Kami</Link> untuk kanal resmi.</p>
          <p className="content-note">Ketentuan di halaman ini merupakan rancangan informasi umum dan perlu diselaraskan dengan peraturan resmi instansi sebelum dipublikasikan.</p>
        </section>
      </article>
    </PublicLayout>
  );
}
