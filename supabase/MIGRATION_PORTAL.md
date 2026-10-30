# Migrasi portal magang — staging

Disusun 30 Oktober 2026 berdasarkan hasil SQL staging yang diberikan pemilik.
Paket 01–03 ini menyiapkan database. Kelanjutan integrasi kode dan tambahan file 04
didokumentasikan di ../docs/INTEGRASI_PORTAL_SUPABASE.md. Penerapan hosted file 04 belum dilakukan oleh agen.
Jangan menerapkan paket ini di proyek produksi atau melakukan push ke branch produksi.

## Dasar pemeriksaan

Staging memiliki 7 tabel, 2 data uji, 4 status awal, dan RLS aktif. Tidak ditemukan
email kosong, kelompok email aktif duplikat, telepon tidak sesuai, atau tanggal tidak valid.
Trigger lama sudah memeriksa durasi satu bulan kalender sampai 366 hari.
Signature kuota tiga dan empat parameter sama-sama tersedia, dengan default pada versi empat parameter.
Hasil tersebut merupakan snapshot pengguna, bukan akses langsung agen ke database.

## Isi paket

1. `migration_portal_01_enum.sql`: empat status tambahan; harus commit terpisah.
2. `migration_portal_02_struktur.sql`: NIM opsional, email aktif unik, validasi data,
   kolom pemeriksaan/pesan/revisi, dan lima tabel pendukung dengan RLS.
3. `migration_portal_03_alur.sql`: trigger alur, dokumen, laporan, survei, kuota, dan RPC server.
4. `verify_portal_staging.sql`: verifikasi baca-saja setelah penerapan.

Lima tabel tambahan: akses_pelacakan, dokumen_pendaftar, penyelesaian_magang,
survei_magang, pengaturan_layanan. Dengan tujuh tabel awal, hasilnya 12 tabel.
email_logs dipertahankan sebagai arsip; SMTP tidak diaktifkan.
Kolom berkas lama dan isi NIM lama tetap disimpan. Metadata berkas lama tidak dikarang
dan tidak otomatis dimasukkan ke dokumen_pendaftar.
Kode pelacakan mentah tidak disimpan. Backend harus membuat kode acak kuat dan hash SHA-256;
pendaftar lama belum otomatis memiliki kode. Distribusi/penerbitan kode lama merupakan pekerjaan integrasi.

## Sebelum menjalankan

- Pastikan proyek yang dipilih adalah staging dan hanya berisi data uji.
- Simpan backup skema, data, definisi fungsi, grants, dan berkas Storage bila diperlukan.
  Salinan tabel saja tidak cukup untuk memulihkan fungsi, RLS, atau Auth.
- Hentikan pengujian yang menulis ke staging selama migrasi. Jangan memakai backend lama setelah file 03.
- Jangan mengubah environment Vercel atau .env produksi.
- Bila data berubah sejak preflight, ulangi `preflight_portal_baru.sql`.

## Penerapan di SQL Editor

Jalankan setiap file secara utuh, dalam urutan 01, 02, 03, sebagai eksekusi terpisah.
Pastikan masing-masing berhasil sebelum meneruskan. Jangan menggabungkan 01 dengan 02/03
di transaksi yang sama: nilai enum baru harus sudah committed.
Jika gagal, hentikan urutan dan simpan pesan error. Jalankan ROLLBACK bila transaksi masih aborted.
File 02 dan 03 transaksional; kegagalan membatalkan perubahan dalam file tersebut saja.
File yang sudah berhasil sebelumnya tidak otomatis dibatalkan.

File 03 membuat ulang overload kuota empat parameter dengan RESTRICT untuk menghapus default.
Jika ada dependensi tercatat, migrasi sengaja gagal. Jangan menambahkan CASCADE;
periksa dan migrasikan dependensi tersebut terlebih dahulu.

Setelah ketiganya berhasil, jalankan verify_portal_staging.sql. Harapan untuk staging ini:
8 status; jumlah pendaftar tetap 2 bila tidak ada input tambahan; nim_nullable YES;
indeks email aktif ada; kelima tabel baru RLS=true; ketiga pemeriksaan akses=false;
pendaftaran_dibuka=false pada penerapan pertama; kedua signature kuota jumlah_default=0.

## Kontrak alur untuk integrasi berikutnya

- Pendaftaran baru selalu pending. Email dinormalisasi trim/lowercase; HP membersihkan
  spasi/tanda hubung lalu wajib 08 dengan total 10–13 digit. Validasi sintaks email tetap di API.
- Email unik pada pending, perbaikan, diperiksa, diterima, tunggu; dapat dipakai lagi sesudah
  ditolak, dibatalkan, selesai. Membuka kembali pengajuan lama tetap diperiksa indeks unik.
- Pending/diperiksa dapat menjadi perbaikan, diterima, ditolak, tunggu, dibatalkan.
  Perbaikan menjadi diperiksa hanya setelah semua dokumen yang diminta diganti.
  Tunggu dapat menjadi diterima, perbaikan, ditolak, dibatalkan.
  Diterima menjadi dibatalkan atau selesai; ditolak/dibatalkan dapat dibuka kembali ke pending.
  Selesai tidak boleh diubah status, divisi, atau tanggalnya.
- Penerimaan/daftar tunggu memerlukan checklist lengkap. Tunggu hanya saat kuota penuh;
  promosi manual tetap memeriksa kuota. Daftar tunggu tidak memesan kapasitas.
- Kuota menghitung diterima dan selesai sesuai rentang tanggal inklusif. Pengurangan kuota
  tidak boleh merusak kebutuhan historis maupun mendatang (sesuai perilaku preview).
- Catatan internal tidak boleh dipublikasikan. API pelacakan harus memilih field publik,
  memakai POST/session yang sesuai, cache no-store, pembatasan percobaan, dan tidak mencatat token mentah.
- akses_pelacakan hanya server; jangan mengirim service role atau hash ke browser.
- dokumen_pendaftar memerlukan objek bucket privat berkas dengan MIME dan ukuran cocok.
  Unggahan Storage dan transaksi database bukan satu transaksi: API harus menangani retry,
  versi berkas, idempotensi dan cleanup objek yang tidak terpakai.
- RPC portal_putuskan untuk keputusan admin; portal_kirim_perbaikan hanya setelah server
  memverifikasi kode pendaftar; portal_periksa_laporan untuk keputusan laporan secara atomik.
  Identitas admin wajib berasal dari sesi server yang terverifikasi, bukan request body.
- Laporan akhir: submitted → revision → submitted dengan dokumen baru, atau submitted → approved.
  Persetujuan hanya pada/setelah tanggal akhir WIB dan menetapkan peserta selesai dalam satu RPC.
  Survei hanya setelah selesai, satu baris per pendaftar, empat skor 1–5, komentar maksimal 1000 karakter.
- Pengaturan awal tertutup; API baru harus menegakkan pembukaan dan tenggat. Backend lama belum membaca tabel ini.
- RPC lama belum mendukung keseluruhan kontrak baru; khususnya penerimaan memerlukan checklist,
  sedangkan penolakan/pembatalan memerlukan pesan publik. Migrasi bukan pengganti pekerjaan integrasi API.

## Pemulihan

Sebelum ada penulisan baru, cara pemulihan yang dianjurkan adalah memulihkan backup ke
proyek staging terpisah lalu mengarahkan konfigurasi pengujian ke hasil pemulihan.
Jangan menjatuhkan tabel baru, memaksa status baru menjadi status lama, atau menghapus enum
sebagai rollback otomatis: itu dapat menghilangkan riwayat dan membuat dua pengajuan aktif berbenturan.
Jika 01 berhasil tetapi 02 gagal, enum tambahan dapat dibiarkan tanpa dipakai sambil memperbaiki penyebabnya.
Jika 02 berhasil tetapi 03 gagal, hentikan penulisan; perbaiki file 03 atau pulihkan backup.
Setelah ada data baru, ekspor serta rekonsiliasi data baru dahulu sebelum pemulihan.
Rollback kode Vercel saja tidak memulihkan database dan belum tentu kompatibel.

## Bukti uji dan batasannya

Jalankan `node --test tests/portal-migration.test.mjs`. Pengujian memakai PostgreSQL PGlite
dengan stub Auth dan metadata Storage, bukan proyek Supabase aktif. Menguji data lama tetap ada,
pengulangan migrasi, penolakan duplikat/format salah, kuota, checklist, revisi,
penyelesaian, survei, hak akses, serta rollback saat data awal tidak memenuhi aturan.
Pengujian tidak membuktikan persaingan beberapa koneksi, layanan Storage sebenarnya,
PostgREST, login, reCAPTCHA produksi, atau alur antarmuka setelah integrasi.
Semua itu wajib diuji di staging sebelum mempertimbangkan produksi.

Hasil lokal 30 Oktober 2026: 15 pengujian portal dan 14 pengujian fondasi lulus
dengan `node --test tests/portal-migration.test.mjs tests/database.test.mjs`.
Termasuk verifikasi RLS admin/non-admin, penolakan RPC browser, metadata dokumen,
revisi laporan, serta penghentian migrasi bila overload kuota mempunyai dependensi.
