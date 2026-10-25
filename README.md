# Portal Permagangan

Portal informasi dan pendaftaran permagangan Kantor Pertanahan Kota Yogyakarta. Aplikasi menyediakan halaman informasi publik, formulir pendaftaran online, serta panel admin untuk mengelola kuota, memverifikasi pendaftar, dan memantau peserta.

## Teknologi

- Next.js 16 dengan App Router dan TypeScript
- React 19
- Supabase: PostgreSQL, Authentication, dan Storage
- Nodemailer untuk notifikasi email
- reCAPTCHA v2 Checkbox untuk perlindungan formulir
- ExcelJS untuk ekspor daftar peserta

## Persyaratan

- Node.js 20.9 atau lebih baru
- npm
- Proyek Supabase untuk fitur database, autentikasi, dan penyimpanan berkas

## Menjalankan secara lokal

```bash
npm install
Copy-Item .env.example .env.local
```

Isi nilai konfigurasi pada `.env.local`, kemudian jalankan:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). File `.env.local` tidak boleh dimasukkan ke Git atau dibagikan karena dapat berisi kredensial.

## Variabel lingkungan

| Variabel | Wajib untuk | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | URL proyek Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Anon/publishable key untuk operasi client dan autentikasi. |
| `SUPABASE_SERVICE_ROLE_KEY` | Pendaftaran, unggah, dan operasi admin | Service role key yang hanya boleh digunakan di server. Jangan pernah menambahkan prefiks `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Formulir pendaftaran | Site key reCAPTCHA v2 Checkbox. |
| `RECAPTCHA_SECRET_KEY` | Formulir pendaftaran | Secret key reCAPTCHA; hanya digunakan di server. |
| `SMTP_HOST` | Email | Host server SMTP. |
| `SMTP_PORT` | Email | Port SMTP; contoh konfigurasi menggunakan `587`. |
| `SMTP_USER` | Email | Nama pengguna SMTP. |
| `SMTP_PASS` | Email | Kata sandi SMTP. |
| `SMTP_FROM` | Email | Nama dan alamat pengirim, misalnya `"Bagian Kepegawaian <magang@instansi.go.id>"`. |

Variabel Supabase diperlukan oleh halaman dan fitur yang terhubung ke Supabase. Pendaftaran online juga memerlukan service role key dan konfigurasi reCAPTCHA. Pengiriman email memerlukan konfigurasi SMTP.

## Menyiapkan Supabase

### Database

Untuk database baru, jalankan seluruh [supabase/schema.sql](./supabase/schema.sql) melalui SQL Editor Supabase. Skema membuat tabel admin, divisi, pendaftar, dan log email, beserta fungsi database untuk kuota dan keputusan verifikasi.

Untuk database lama, **jangan jalankan skema baru di atas database yang sudah berisi data**. Pilih migrasi sesuai kondisi database:

1. Database lama yang masih menggunakan tabel `periode` dan `slots`: jalankan [supabase/migration_kapasitas_divisi.sql](./supabase/migration_kapasitas_divisi.sql).
2. Setelah migrasi kapasitas atau untuk database aplikasi yang sudah berjalan, jalankan [supabase/migration_penempatan_divisi_durasi.sql](./supabase/migration_penempatan_divisi_durasi.sql). Migrasi ini memungkinkan admin menentukan divisi saat verifikasi dan menegakkan durasi magang minimum satu bulan.
3. Bila database lama memiliki constraint jenis email pada `email_logs` yang belum mencakup tipe terbaru, jalankan [supabase/migration_email_log_types.sql](./supabase/migration_email_log_types.sql).

Tinjau kondisi dan cadangkan database sebelum menjalankan migrasi produksi. Jalankan migrasi hanya sekali dan sesuai urutan yang berlaku untuk versi database Anda.

### Membuat akun administrator

1. Buat pengguna melalui Supabase Dashboard → **Authentication → Users**.
2. Tambahkan UUID pengguna tersebut ke tabel `public.admins`:

```sql
insert into public.admins (user_id, nama)
values ('UUID-USER-AUTH', 'Nama Admin');
```

Hanya pengguna yang terdaftar di `admins` yang dapat mengakses panel admin. Perlindungan dilakukan pada middleware dan diperiksa kembali pada API admin.

### Penyimpanan berkas

Buat bucket Supabase Storage dengan pengaturan berikut:

- Nama: `berkas`
- Akses: **private**
- Ukuran maksimum: 5 MB per berkas
- MIME yang diizinkan: `application/pdf`, `image/jpeg`, `image/png`

Pendaftaran mengunggah CV dan surat pengantar ke bucket ini. Tautan unggah bertanda tangan berlaku terbatas; berkas tidak dibuat publik.

## Layanan eksternal

### reCAPTCHA

Daftarkan domain lokal dan domain produksi pada Google reCAPTCHA Admin Console dengan tipe **reCAPTCHA v2 Checkbox**. Atur site key dan secret key pada environment yang sesuai. Verifikasi dilakukan di server sebelum tautan unggah dibuat. Formulir pendaftaran tidak dapat digunakan bila reCAPTCHA belum dikonfigurasi.

### Email

Atur kredensial SMTP untuk mengirim hasil keputusan kepada pendaftar. Hasil pengiriman dicatat pada `email_logs`; email yang gagal dapat dicoba ulang dari detail verifikasi. Pastikan alamat `SMTP_FROM` diizinkan oleh penyedia SMTP.

## Fitur dan rute

### Halaman publik

| Rute | Fungsi |
| --- | --- |
| `/` | Halaman utama portal permagangan. |
| `/ketentuan` | Informasi ketentuan permagangan. |
| `/dokumen` | Alias lama yang mengarahkan pengunjung ke informasi kapasitas. |
| `/survey` | Informasi survei kepuasan. |
| `/kontak` | Informasi kontak dan lokasi kantor. |
| `/slot` | Kapasitas aktif setiap divisi. |
| `/daftar` | Formulir pendaftaran dan unggah berkas. Divisi ditentukan admin saat verifikasi. |

### Panel administrator

| Rute | Fungsi |
| --- | --- |
| `/admin/login` | Login administrator. |
| `/admin` | Ringkasan status pendaftaran. |
| `/admin/slot` | Melihat dan mengelola kuota setiap divisi. |
| `/admin/verifikasi` | Antrean pendaftar yang perlu ditinjau. |
| `/admin/verifikasi/[id]` | Detail pendaftar, penetapan divisi, keputusan, dan percobaan ulang email. |
| `/admin/pemagang` | Daftar peserta. |
| `/admin/pemagang/[id]` | Detail dan tindakan pengelolaan peserta. |
| `/admin/pemagang/baru` | Menambahkan peserta secara manual. |

API aplikasi berada di bawah `app/api/`. Route tersebut menangani pendaftaran dan unggahan, tindakan admin, akses berkas privat, email, serta ekspor daftar peserta.

## Aturan pendaftaran

- Durasi magang minimal satu bulan dan maksimal 366 hari.
- Pendaftar mengunggah CV dan surat pengantar berformat PDF, JPG, atau PNG; setiap berkas maksimal 5 MB.
- Berkas disimpan di bucket privat `berkas`.
- Status awal pendaftaran adalah menunggu verifikasi (`pending`).
- Admin menetapkan divisi ketika memproses pendaftaran. Keputusan penerimaan memeriksa ketersediaan kuota pada rentang tanggal yang diajukan.
- Peserta juga dapat ditambahkan oleh admin melalui formulir manual.

## Struktur proyek

```text
app/          Halaman publik, panel admin, dan API routes
components/   Komponen antarmuka bersama
lib/          Integrasi Supabase, email, ekspor, validasi, dan helper
public/       Aset statis dan ilustrasi
supabase/     Skema database dan migrasi SQL
middleware.ts Proteksi rute panel administrator
```

## Pemeriksaan dan build

```bash
npm run lint
npm run build
npm run start
```

`npm run start` menjalankan hasil build produksi, sehingga jalankan `npm run build` terlebih dahulu.

## Catatan deployment

- Atur semua variabel lingkungan pada platform deployment dan pastikan nilainya berasal dari proyek Supabase yang sama.
- Jangan mengekspos `SUPABASE_SERVICE_ROLE_KEY`, `RECAPTCHA_SECRET_KEY`, atau kredensial SMTP ke browser.
- Pastikan domain produksi didaftarkan di reCAPTCHA dan bucket `berkas` tetap private.
- Terapkan skema atau migrasi database yang tepat sebelum menjalankan aplikasi.
- Pastikan kebijakan privasi, persetujuan pemrosesan data, dan prosedur retensi berkas telah sesuai sebelum menerima pendaftaran.
