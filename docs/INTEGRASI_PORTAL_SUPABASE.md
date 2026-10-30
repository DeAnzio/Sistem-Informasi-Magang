# Integrasi portal dengan Supabase

Status 30 Oktober 2026: kode disiapkan lokal pada branch codex/persiapan-migrasi-portal.
Tidak ada push, deployment, atau penulisan pengujian ke Supabase oleh agen.
Proyek rpvdtvwmzthhiblkhjjt diketahui dipakai bersama oleh .env.local dan website Vercel.
Jangan menyebut proyek ini staging terpisah. Perubahan SQL di sana juga memengaruhi website lama.

## Tambahan database sebelum menjalankan kode baru

Jalankan `supabase/migration_portal_04_integrasi.sql` sesudah 01–03. File ini menambahkan
transaksi finalisasi unggahan, sesi unggahan portal, pembatasan percobaan, pengaturan atomik,
input manual, dan penerbitan ulang kode. Tidak menghapus data lama atau membuka pendaftaran.
Ini file baru yang belum dijalankan oleh agen di database hosted.
Tambahan dua tabel membuat total 14 tabel jika sebelumnya ada 12.

Jangan menjalankan ulang schema.sql atau migration_fondasi.sql di database yang sudah dimigrasikan.
Pastikan perubahan NIM opsional yang dikonfirmasi pemilik tetap berlaku.

## Konfigurasi

Tetap menggunakan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY.
Tidak ada kunci yang ditulis dalam kode atau laporan pengujian.
Captcha portal menggunakan kunci konfigurasi nyata, tanpa fallback kunci uji atau bypass.
Bucket `berkas` harus privat dan mendukung PDF, JPG, PNG, maksimum 5 MB per objek.
Tidak ada SMTP.

`npm run dev:portal` menjalankan portal di http://127.0.0.1:3002 dengan build lokal terpisah
dan koneksi .env.local (`npm run dev` juga memakai koneksi ini pada port default). Semua pengiriman formulir
dan tindakan admin di portal ini menulis ke proyek Supabase yang dipakai website aktif.
`npm run dev:preview` tetap menjalankan simulasi terpisah pada /preview dengan penyimpanan komputer.
Jangan menganggap hasil pengujian /preview membuktikan integrasi Supabase sudah diuji.

## Perubahan alur

- Beranda dan halaman publik memakai tampilan portal instansi yang sudah disetujui.
- /admin/login menggunakan email/password Supabase; akses admin diverifikasi di server.
- /admin/pengajuan, tugas, kalender, laporan, penyelesaian, survei, dan pengaturan memakai data Supabase.
- /admin/pemagang/baru mencatat pengajuan manual sebagai pending. Penerimaan tetap melalui checklist.
- Bookmark lama daftar/detail diarahkan ke halaman pengajuan baru.
- Endpoint mutasi formulir lama mengembalikan 409 dan meminta muat ulang; mencegah alur lama
  melewati pengaturan pembukaan pendaftaran atau aturan baru.
- Pelacakan memakai POST, tidak menaruh kode di URL. Kode acak 192-bit; database menyimpan hash.
- Peserta lama belum memiliki kode otomatis. Petugas dapat menerbitkan kode baru pada detail;
  kode sebelumnya menjadi tidak berlaku, dan kode baru harus disampaikan secara pribadi.
- Data publik dipilih secara eksplisit; email/telepon/catatan internal/hash tidak dikembalikan ke pelacakan.
- Dokumen diunggah langsung ke Storage via signed upload. Finalisasi SQL memverifikasi metadata dan
  menyimpan seluruh pendaftaran/versi berkas secara atomik. Retry finalisasi tidak menggandakan pengajuan.
- Tiket finalisasi yang belum terkonfirmasi disimpan di sessionStorage tab untuk dicoba ulang.
  Pesan kegagalan menyertakan kode pemulihan. Saat mencoba kembali setelah tiket kedaluwarsa,
  server mengembalikan bukti bila pengajuan sudah tersimpan atau membatalkan sesi lama secara
  terkunci sebelum mengizinkan pengiriman baru. Kegagalan koneksi tidak dianggap pembatalan.
- Draf surat tetap bertanda bukan surat resmi. Berkas peserta hanya dapat diunduh admin lewat tautan privat sementara.
- Berkas lama yang belum punya metadata versi ditampilkan sebagai versi 0/terdahulu, tanpa mengarang metadata database.

## Pengujian lokal terisolasi

- `npm test`: validator, token, aturan tanggal, dan logika laporan/preview.
- `node --test tests/portal-migration.test.mjs tests/database.test.mjs`: SQL nyata di PGlite dengan stub Auth/Storage.
- `node tests/portal-http.mjs`: build Next terpisah di .next-portal-test, backend HTTP tiruan,
  blokir seluruh koneksi luar termasuk mengalihkan verifikasi CAPTCHA hanya ke stub lokal.
  Jangan deploy hasil build ini: hanya berisi konfigurasi tiruan.
- `npm run typecheck` dan `npm run lint`.

HTTP mock memeriksa kontrak dan pembatasan akses; tidak membuktikan layanan Supabase/Google nyata,
login end-to-end, persaingan beberapa koneksi, atau rendering semua interaksi browser.
Uji hosted/manual tetap diperlukan setelah file 04 diterapkan. Perhatikan bahwa itu menggunakan database bersama.

## Urutan uji manual setelah 04

1. Jalankan portal lokal, buka /admin/login, login memakai akun admin yang sudah terdaftar.
2. Pastikan dua data lama tetap tampil; buka dokumen lama dan detail peserta.
3. Periksa Pengaturan. Pendaftaran tetap tertutup sampai petugas sengaja membukanya untuk uji.
4. Jika CAPTCHA lokal belum didaftarkan di Google, jangan melewati verifikasi; uji pendaftaran online
   menunggu domain yang sesuai. Pengajuan manual dapat dipakai untuk uji keputusan.
5. Buat data uji baru dengan email berbeda, simpan kode, uji pelacakan dan pastikan data internal tidak tampil.
6. Uji revisi kedua berkas, checklist, penerimaan, penolakan, daftar tunggu, perubahan jadwal, dan kuota penuh.
7. Uji laporan akhir/revisi, larangan selesai sebelum waktunya, lalu survei sekali setelah selesai.
8. Uji pengaturan dan rekap. Setelah selesai, tinjau data uji yang dibuat sebelum membersihkannya.
9. Deployment belum dilakukan. Sebelum push branch produksi, cocokkan konfigurasi Vercel dan hasil uji hosted.

## Pembersihan unggahan tidak terpakai

`node --env-file=.env.local --import tsx scripts/cleanup-portal-uploads.ts` membaca maksimum
100 sesi kedaluwarsa yang telah melewati tambahan tiga jam. Tambahkan `--apply` hanya saat
hendak membersihkan objek sementara. Sesi tersimpan tidak dihapus; pembatalan dikunci terhadap finalisasi.
Ulangi bila masih ada batch. Tidak ada cron atau pembersihan hosted yang dijalankan otomatis oleh agen.
