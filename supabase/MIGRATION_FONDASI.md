# Penerapan fondasi

## Database baru

Jalankan **schema.sql saja** di SQL Editor Supabase pada database kosong. Baseline sudah memuat seluruh fondasi, enum, aktivitas, sesi unggahan, fungsi keputusan, trigger kuota, dan izin akses. Buat bucket `berkas` private sesuai README, kemudian tambahkan akun admin.

## Database yang sudah digunakan

Pemeriksaan database aktif menunjukkan default grant `ALL` untuk `anon` dan `authenticated`, termasuk `TRUNCATE`. RLS tidak membatasi `TRUNCATE`. Berkas `migration_akses_minimum.sql` memperbaiki izin pada empat tabel lama tanpa menghapus data atau akun: publik hanya membaca divisi, sedangkan pengguna login membaca data sesuai RLS. Penulisan melalui API server memakai `service_role`. Perbaikan yang sama tercakup dalam migrasi fondasi, termasuk tabel baru. Jika masih menggunakan frontend lama yang menulis langsung ke tabel, jalur itu akan ditolak setelah izin diperketat.

1. Cadangkan database dan Storage. Uji salinannya di proyek staging terlebih dahulu.
2. Jika masih memakai `periode`/`slots`, jalankan `migration_kapasitas_divisi.sql`, kemudian `migration_penempatan_divisi_durasi.sql` sesuai panduan README. Jangan jalankan migrasi kapasitas pada skema yang sudah memakai kapasitas per divisi.
3. Jalankan `preflight_fondasi.sql` sebagai pemeriksaan baca-saja; hasilnya harus ditinjau sebelum migrasi. Tinjau duplikat tanpa divisi, jadwal, dan kapasitas dengan query di bawah. Tentukan penanganan setiap duplikat bersama pengelola. Migrasi tidak menghapus atau menggabungkan data secara otomatis.
4. Jalankan **migration_fondasi_enum.sql** sebagai eksekusi terpisah hingga selesai/committed. PostgreSQL memerlukan commit sebelum nilai enum baru dapat digunakan.
5. Jalankan **migration_fondasi.sql**. File ini transaksional; jika gagal, tinjau pesan error dan kondisi skema. Duplikat tanpa divisi akan menghentikan migrasi. Migrasi tidak bergantung pada tabel `email_logs`. Jika tabel tersebut sudah ada, riwayatnya dipertahankan dan izin menulis dari browser dicabut.
6. Terapkan kode aplikasi bersama migrasi. Signature RPC kuota kini memerlukan UUID admin dan mutasi tabel dari browser dicabut. Kode versi lama tidak kompatibel dengan perubahan tersebut.
7. Tiket unggah dari versi aplikasi lama tidak berlaku setelah pembaruan; minta pengguna memuat ulang form dan memulai ulang pendaftaran. Rencanakan perpindahan saat tidak ada unggahan aktif.

Versi ini menghapus opsi pengiriman dari kontrak API. Halaman admin yang masih terbuka dari versi lama perlu dimuat ulang setelah rilis.

## Membaca hasil pemeriksaan awal

`preflight_fondasi.sql` berjalan dalam transaksi baca-saja. Hasilnya memuat inventaris kolom, status enum, fungsi, kebijakan akses, dan pesan `FONDASI_PREFLIGHT` dengan ringkasan data. Tidak ada nama, email, atau NIM peserta pada ringkasan otomatis tersebut.

- `MISSING`: tabel utama belum lengkap; jangan menerapkan patch database lama pada database kosong.
- `LEGACY`: struktur masih perlu dipetakan ke migrasi kapasitas/periode sebelum pemeriksaan lengkap dapat berjalan.
- `REVIEW_REQUIRED`: ditemukan duplikat, jadwal tidak valid, status/penempatan bermasalah, atau puncak peserta melebihi kuota. Tinjau data bersama pengelola tanpa menghapus otomatis.
- `DATA_CHECKS_CLEAR`: pemeriksaan data yang tercakup tidak menemukan masalah. Ini **bukan** konfirmasi penuh bahwa migrasi aman; inventaris struktur, izin, backup, serta hasil staging tetap perlu diperiksa. Perhitungan kuota juga mencakup riwayat lama, sehingga kapasitas historis perlu ditafsirkan sesuai kebijakan pengelola.

Jalankan lagi sesaat sebelum migrasi karena data dapat berubah setelah pemeriksaan pertama. Bila salah satu query gagal, pemeriksaan dianggap belum selesai.

## Jika staging belum tersedia

Siapkan proyek Supabase terpisah dengan data uji dan konfigurasi lokal sendiri. Jangan menggunakan kunci produksi untuk pengujian mutasi. Buat bucket privat `berkas`, akun admin uji, dan terapkan skema baru terlebih dahulu untuk uji alur aplikasi. Gunakan salinan database lama yang telah ditinjau untuk latihan migrasi; skema baru tidak dijalankan di atas salinan berisi data.

Workspace saat persiapan versi tanpa email belum memiliki koneksi database atau proyek staging. Pengujian otomatis lokal tidak menjalankan migrasi pada database aktif, dan hasil pemeriksaan data aktif belum tersedia.

Query peninjauan, tanpa mengubah data:

```sql
select nim, tanggal_mulai, count(*) as jumlah, array_agg(id order by created_at) as ids
from public.applicants
where divisi_id is null
group by nim, tanggal_mulai
having count(*) > 1;

select id, nama, tanggal_mulai, tanggal_selesai
from public.applicants
where tanggal_selesai < (tanggal_mulai + interval '1 month')::date
   or tanggal_selesai - tanggal_mulai > 366;
```

Aturan duplikat dipertahankan mengikuti model sebelumnya: NIM + divisi + tanggal mulai, ditambah indeks khusus NIM + tanggal mulai untuk data tanpa divisi. Ini tidak melarang semua jadwal berulang seseorang atau penempatan di divisi berbeda.

Data historis tidak dipaksa diubah oleh migrasi. Validasi durasi berlaku ketika data disimpan/diperbarui; jadwal historis yang tidak valid perlu ditinjau sebelum diproses lebih lanjut.

Migrasi juga membolehkan `divisi_id` kosong agar penempatan dapat dilakukan sesudah pendaftaran. `created_at` disetel wajib dengan default `now()`; bila ada nilai lama yang kosong, migrasi berhenti tanpa mengisi tanggal buatan. Berdasarkan inventaris database yang diberikan pengelola, status `dibatalkan`, kolom pembatalan, tabel aktivitas, serta fungsi pembatalan/perubahan jadwal sudah tersedia. Penambahan enum akan menjadi no-op bila nilainya sudah ada; migrasi kapasitas lama tidak diperlukan untuk struktur yang sudah memakai `divisi.kuota` dan tanggal pada `applicants`.

## Pemeriksaan staging

- Login sebagai admin dan pastikan akun biasa tidak dapat memutasi tabel maupun menjalankan RPC keputusan.
- Daftar online, buka detail, lihat/unduh berkas, tetapkan divisi, terima/tolak dan periksa aktivitas.
- Tambahkan peserta manual dengan status pending dan diterima; saat kuota penuh peserta tetap pending dengan pemberitahuan.
- Ubah jadwal yang bertumpang tindih, batalkan peserta, turunkan kuota, dan verifikasi kapasitas serta auditnya.
- Kirim dua request finalisasi untuk tiket sama dan dua penerimaan untuk satu slot tersisa dari koneksi terpisah. Hanya satu keputusan boleh menghabiskan slot terakhir.
- Coba cleanup sesudah finalisasi: endpoint harus menolak dan berkas harus tetap ada.
- Ekspor lebih dari 1.000 baris, cocokkan jumlah dan ID, lalu periksa pagination dan angka dashboard.

`npm run test:db` menjalankan SQL nyata pada PostgreSQL PGlite dalam memori dengan stub skema auth/storage. Tes ini mencakup baseline dan migrasi berulang, tetapi tidak menggantikan pengujian Supabase Storage, browser, maupun transaksi multi-koneksi di staging.

`npm run test:smoke` memeriksa lima aksi admin, input manual, dan halaman detail pada build produksi menggunakan backend auth/database tiruan. Tes memastikan seluruh alur tersebut berjalan tanpa SMTP, biodata email tetap tampil, endpoint retry sudah 404, dan aplikasi tidak mengakses tabel log pengiriman.

## Pembersihan unggahan sementara

Jalankan dari server dengan `.env.local` yang berisi konfigurasi Supabase server:

```bash
npm run cleanup:uploads
```

Script hanya memproses sesi `siap`/`dibatalkan` yang berumur lebih dari 24 jam, setelah masa berlaku signed upload URL berlalu. Fungsi database membatalkan sesi dengan row lock sebelum berkas dihapus sehingga finalisasi dan cleanup tidak bisa sama-sama menang. Sesi tersimpan tidak dibersihkan. Tombstone sesi batal dipertahankan untuk retry penghapusan Storage dan unggahan terlambat.

Script ini belum dijadwalkan otomatis. Jalankan melalui mekanisme operasional server yang disepakati pengelola. Berkas lama tanpa sesi dari versi aplikasi sebelumnya tidak disentuh.

## Batas ruang lingkup

Notifikasi email dan SMTP sudah dihapus dari aplikasi. Skema baru tidak membuat tabel log pengiriman; tabel `email_logs` lama dipertahankan sebagai arsip bila tersedia. Tanggal masa lalu masih diperbolehkan sesuai perilaku lama; durasi tetap minimal satu bulan kalender dan maksimal 366 hari. Informasi beranda disamakan dengan aturan kode tersebut. Perubahan aturan resmi perlu keputusan pengelola.
