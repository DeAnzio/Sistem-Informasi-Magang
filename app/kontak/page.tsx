import PublicLayout from "@/components/public-layout";

export default function KontakPage() {
  return (
    <PublicLayout activePath="/kontak" title="Kontak Kami">
      <div className="public-container public-content contact-layout">
        <div className="contact-map">
          <iframe
            title="Peta pencarian Kantor Wilayah BPN D.I. Yogyakarta"
            src="https://www.google.com/maps?q=Kantor+Wilayah+BPN+D.I.+Yogyakarta&output=embed"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <section className="contact-details" aria-labelledby="contact-title">
          <p className="public-eyebrow">INFORMASI KANTOR</p>
          <h2 id="contact-title">Kantor BPN D.I. Yogyakarta</h2>
          <dl>
            <div><dt>Alamat</dt><dd>Alamat lengkap kantor perlu dikonfirmasi melalui kanal resmi instansi.</dd></div>
            <div><dt>Telepon dan Fax</dt><dd>Informasi nomor telepon dan fax belum tersedia.</dd></div>
            <div><dt>Email</dt><dd>Alamat email layanan magang belum tersedia.</dd></div>
            <div><dt>Narahubung</dt><dd>Petugas pengelola magang pada unit kerja terkait.</dd></div>
          </dl>
          <p className="content-note">Peta menampilkan hasil pencarian nama instansi. Pastikan alamat dan kanal kontak resmi sebelum berkunjung atau mengirim dokumen.</p>
        </section>
      </div>
    </PublicLayout>
  );
}
