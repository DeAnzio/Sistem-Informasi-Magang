# Sistem Permagangan

Portal permagangan berbasis Next.js App Router, TypeScript, Supabase, dan Nodemailer.

## Menjalankan aplikasi

```bash
npm install
npm run dev
```

Buat file `.env` atau `.env.local` di akar proyek dan isi variabel yang diperlukan. Jika belum memiliki salah satunya, salin `.env.example` menjadi `.env.local` dengan `Copy-Item .env.example .env.local`, lalu isi nilainya. Next.js memuat kedua file tersebut secara otomatis; jika keduanya ada, `.env.local` memiliki prioritas. Jangan commit file environment yang berisi kredensial.

Buka http://localhost:3000. Halaman publik dan area admin tersedia, tetapi fitur yang berhubungan dengan layanan eksternal memerlukan konfigurasi berikut.

## Konfigurasi Supabase

1. Buat proyek Supabase.
2. Jalankan seluruh isi `supabase/schema.sql` di SQL Editor.
   Jika database sudah memakai model lama berbasis `periode`/`slots`, jalankan `supabase/migration_kapasitas_divisi.sql` sebagai gantinya (jangan jalankan skema baru di atas database lama).
3. Buat bucket Storage bernama `berkas`, set sebagai **private**, batas file 5 MB, MIME `application/pdf,image/jpeg,image/png`.
4. Buat user admin melalui Authentication → Users, lalu masukkan UUID dan nama admin:

```sql
insert into public.admins (user_id, nama)
values ('UUID-USER-AUTH', 'Nama Admin');
```

5. Isi URL, anon key, dan service role key pada `.env` atau `.env.local`. Service role key hanya digunakan oleh route server.

## Keamanan formulir pendaftaran

Formulir pendaftaran dilindungi reCAPTCHA v3. Daftarkan domain aplikasi di Google reCAPTCHA Admin Console, pilih reCAPTCHA v3, lalu atur `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` dan `RECAPTCHA_SECRET_KEY` pada `.env` atau `.env.local` (secret key hanya di server). Verifikasi dilakukan di server sebelum URL unggah diterbitkan; action harus `submit_registration`, hostname harus cocok, dan skor minimum adalah `0.5`. Formulir tidak tersedia bila kunci belum diatur. Validasi data, pemeriksaan kuota di server, pembatasan tipe dan ukuran berkas, serta URL unggah bertanda tangan tetap aktif.

## Konfigurasi email

Isi kredensial SMTP di `.env` atau `.env.local`. Hasil keputusan dikirim ke pendaftar dan disimpan ke tabel `email_logs`. Pengiriman yang gagal dapat dicoba ulang dari halaman detail verifikasi.

## Rute aplikasi

- `/` informasi layanan magang
- `/ketentuan` ketentuan magang
- `/dokumen` mengarahkan ke informasi kuota magang (alias lama)
- `/survey` informasi survey kepuasan
- `/kontak` kontak dan peta kantor
- `/slot` informasi kapasitas aktif tiap divisi
- `/daftar` formulir divisi dan tanggal magang dengan unggah berkas privat
- `/admin/login` login admin
- `/admin` dashboard ringkasan
- `/admin/slot` ringkasan dan pengaturan kuota tiap divisi
- `/admin/pemagang/baru` input peserta manual
- `/admin/verifikasi` antrean pendaftar
- `/admin/verifikasi/[id]` detail, keputusan, dan kirim ulang email

Akses `/admin/*` diperiksa melalui `proxy.ts`, menggunakan autentikasi Supabase dan tabel `admins`. API admin juga melakukan pemeriksaan otorisasi sendiri.

## Pemeriksaan

```bash
npm run lint
npm run build
```

Jangan commit file environment. Sebelum produksi, pastikan domain reCAPTCHA, persetujuan pemrosesan data, bucket privat, SMTP instansi, dan environment variables Vercel sudah benar.
