# Hasil pemeriksaan kode — 26 Oktober 2026

> Dokumen ini adalah catatan kondisi **sebelum** implementasi paket fondasi. Sejumlah temuan di bawah sudah ditangani oleh perubahan kode berikutnya. Lihat [panduan fondasi](./supabase/MIGRATION_FONDASI.md) untuk skema, penerapan, pengujian, dan batas pekerjaan yang masih tersisa; laporan awal ini dipertahankan sebagai jejak pemeriksaan.

> Perubahan ruang lingkup terbaru: pengiriman notifikasi email dan SMTP dihapus. Temuan mengenai pengiriman, retry, dan antrean email di laporan awal tidak lagi menjadi pekerjaan lanjutan. Alamat email peserta tetap menjadi biodata; riwayat pengiriman lama tidak dihapus oleh migrasi.

Pemeriksaan mencakup seluruh berkas sumber di app/, components/, lib/, SQL di supabase/, konfigurasi, README, manifest dan metadata dependensi pada lockfile, serta referensi aset dan CSS. Aset gambar biner tidak dinilai secara visual. Tidak ada kode aplikasi yang diubah.

Metode: pembacaan statis, pencocokan pemanggilan API dengan SQL, dan eksekusi helper TypeScript menggunakan Node.js. Database, Storage, SMTP, browser, dan pengaturan layanan produksi belum diuji. Risiko konkurensi dan keamanan di bawah merupakan analisis kode, bukan hasil eksploitasi langsung. Strix tidak terpasang.

Pemeriksaan `npm run lint` dan `npm run build` gagal dimulai karena dependensi lokal belum terpasang: perintah eslint dan next tidak ditemukan. Ini keterbatasan pemeriksaan lingkungan, bukan bukti build kode rusak. Audit CVE dependensi belum dilakukan.

Prioritas: P1 = segera diperbaiki karena menghambat fitur utama atau mengancam integritas data; P2 = masalah fungsional/keandalan yang perlu diperbaiki; P3 = kelengkapan produk dan pemeliharaan. Tidak semua kekurangan merupakan kerentanan keamanan.

## Masalah fungsional dan integritas data

### 1. P1 — Skema database belum memenuhi kebutuhan aplikasi

Lokasi: `supabase/schema.sql:23`, `app/admin/pemagang/[id]/page.tsx:99`, `lib/email.ts:106`, `app/api/pemagang/[id]/aksi/route.ts`.

SQL yang tersedia tidak mendefinisikan status `dibatalkan`, kolom `dibatalkan_at` dan `catatan_batal`, tabel `aktivitas_pendaftar`, serta fungsi `batalkan_pendaftar` dan `ubah_jadwal_pemagang`. Tidak ada migrasi lain dalam repository yang menambahkannya. Akibatnya, database baru berdasarkan README akan gagal memuat detail peserta, gagal membaca data untuk pengiriman email, gagal membuka berkas karena pencatatan akses gagal, dan tidak mendukung pembatalan/perubahan jadwal. Input manual berhenti pada status pending ketika pencatatan aktivitas gagal. Ini kesimpulan untuk database dari SQL repository; kondisi database produksi belum diperiksa.

Perbaikan: lengkapi baseline dan migrasi fitur tersebut, termasuk constraint aksi, RLS, izin, indeks, transaksi dan audit; verifikasi dari database kosong.

### 2. P1 — Pencegahan pendaftaran ganda tidak bekerja untuk divisi kosong

Lokasi: `supabase/schema.sql:46`, `app/api/daftar/route.ts:49`.

Pendaftaran online selalu menyimpan `divisi_id: null`, sedangkan unique constraint menggunakan `(nim, divisi_id, tanggal_mulai)`. Secara default PostgreSQL menganggap NULL berbeda sehingga beberapa pendaftaran dengan NIM dan tanggal mulai sama dapat lolos. Pengecekan ID tiket hanya mencegah pengulangan tiket yang sama, bukan pengiriman ulang dengan tiket baru.

Perbaikan: tetapkan definisi duplikat yang sesuai aturan bisnis dan tegakkan di database, misalnya indeks khusus pendaftaran yang belum ditempatkan atau constraint NULLS NOT DISTINCT yang sesuai.

### 3. P1 — Cleanup bisa menghapus berkas pendaftaran yang sudah tersimpan

Lokasi: `app/api/daftar/route.ts:23`, `app/api/pemagang/manual/route.ts:126`.

Cabang cleanup/hapus dijalankan sebelum pemeriksaan apakah applicant sudah tersimpan. Tiket yang masih berlaku dapat dipakai setelah penyimpanan sukses untuk menghapus berkas yang masih dirujuk database. Pada jalur publik, pemegang tiket pendaftarannya sendiri bisa melakukan ini tanpa login admin. Dampaknya berada pada berkas pendaftaran yang ditunjuk tiket tersebut, bukan akses bebas ke berkas orang lain.

Perbaikan: bedakan unggahan sementara dan final, konsumsi tiket secara atomik, dan tolak cleanup ketika unggahan telah dipakai applicant.

### 4. P1 — Pengiriman manual bersamaan berisiko menghapus berkas yang berhasil disimpan

Lokasi: `app/api/pemagang/manual/route.ts:136` dan `:185`.

Dua request simpan dengan tiket sama dapat sama-sama melihat data belum ada. Setelah request pertama berhasil insert, request kedua mendapat konflik primary key lalu menghapus paths tanpa memeriksa ulang keberadaan applicant. Record pemenang dapat kehilangan berkas. Jalur online sudah mempunyai pemeriksaan ulang setelah insert gagal, sedangkan jalur manual belum.

Perbaikan: jadikan penyimpanan idempoten dan jangan menghapus objek yang sudah dipakai record lain/request pemenang. Uji konkurensi diperlukan.

### 5. P1 — Aturan kuota dan verifikasi dapat dilewati melalui akses tabel admin

Lokasi: `supabase/schema.sql:72-77` dan `:195-196`.

Admin mendapatkan izin insert/update/delete langsung pada applicants, divisi, dan email_logs. RLS hanya memeriksa keanggotaan admin. Dengan sesi admin, operasi langsung melalui Supabase dapat mengubah status, jadwal, kuota, dan informasi verifikasi tanpa menjalankan RPC pemeriksa kuota atau mencatat aktivitas. Tidak ada trigger database dalam repository yang menegakkan seluruh aturan tersebut.

Ini masalah integritas pada batas akses admin, bukan temuan bahwa pengguna anonim dapat mengubah data.

Perbaikan: batasi mutasi pada operasi terkontrol atau tegakkan aturan wajib di database untuk setiap jalur penulisan.

### 6. P2 — Penerimaan dan penolakan belum mencatat riwayat aktivitas

Lokasi: fungsi `terima_pendaftar` dan `tolak_pendaftar` di schema.sql dan migrasi; cabang aksi di API peserta.

Fungsi hanya mengubah applicants. API juga tidak menambahkan aktivitas untuk kedua aksi ini. Menambahkan tabel aktivitas saja belum membuat riwayat keputusan lengkap. Perubahan divisi pun hanya mencatat aksi dan aktor, tanpa divisi lama/baru. Perubahan kuota tidak mempunyai audit aktor.

Perbaikan: catat perubahan penting beserta nilai sebelum/sesudah dalam transaksi yang sama dengan perubahan data.

### 7. P2 — Jumlah dashboard bisa lebih kecil dari jumlah sebenarnya

Lokasi: `app/admin/page.tsx:19`.

Dashboard mengambil semua baris status lalu menghitungnya di JavaScript. Hasil dibatasi oleh Max Rows Supabase. Dengan batas default 1.000, data yang lebih banyak tidak seluruhnya dihitung.

Perbaikan: gunakan agregasi database atau query count per status.

### 8. P2 — Antrean verifikasi tidak mempunyai pagination

Lokasi: `app/admin/verifikasi/page.tsx:21`.

Query menampilkan pending terbaru tanpa pagination maupun count terpisah. Pada batas hasil layanan, pending lama bisa tidak tampil dan angka jumlah pending hanya menghitung baris yang berhasil dimuat.

Perbaikan: pagination, total count, dan urutan peninjauan yang jelas.

### 9. P2 — Ekspor hingga 5.000 baris bisa terpotong tanpa pemberitahuan

Lokasi: `app/api/export/route.ts:128`.

Kode mengizinkan count hingga 5.000 lalu meminta satu range 0–4.999. Range tersebut tidak menghapus batas Max Rows server. Pada konfigurasi default 1.000, ekspor bisa hanya berisi 1.000 baris meskipun count lebih besar. Jumlah hasil tidak dicocokkan dengan count.

Perbaikan: ambil data dalam beberapa halaman dan validasi kelengkapan hasil.

### 10. P2 — Escape pencarian belum menangani grammar PostgREST

Lokasi: `lib/pemagang-filters.ts:1`, `app/admin/pemagang/page.tsx:57`, `app/api/export/route.ts:94`.

Helper menangani beberapa karakter LIKE, tetapi hasilnya disisipkan langsung ke `.or(...)`. Karakter seperti tanda kurung dan tanda kutip belum ditangani sesuai grammar PostgREST. Bintang juga masih dibiarkan, padahal mempunyai arti wildcard pada filter LIKE PostgREST. Pencarian dapat error atau mempunyai arti berbeda dari teks literal pengguna.

Pemeriksaan langsung: `escapeApplicantSearchTerm('Kampus (A)')` tetap menghasilkan `Kampus (A)` dan `escapeApplicantSearchTerm('*')` tetap menghasilkan `*`. Dampak pada layanan perlu diuji; ini bukan klaim SQL injection atau bypass RLS.

Perbaikan: bangun filter dengan quoting yang benar atau pindahkan pencarian berparameter ke fungsi database.

### 11. P2 — Email dikirim dalam request yang mengubah data

Lokasi: `app/api/pemagang/[id]/aksi/route.ts`, `app/api/pemagang/manual/route.ts`, `lib/email.ts:154`.

Status disimpan sebelum SMTP selesai. Jika proses berhenti atau request timeout sesudah penyimpanan, keputusan tetap berubah tetapi email dan log bisa belum tercatat. Pada aksi yang hanya berlaku untuk pending, mengulang request tidak otomatis melanjutkan pengiriman yang terputus.

Perbaikan: simpan pekerjaan email/outbox bersama keputusan, kemudian proses dengan retry terpisah.

### 12. P2 — Tidak ada jalur kirim ulang jika log email tidak terbentuk

Lokasi: `app/admin/pemagang/[id]/page.tsx:209`, `lib/email.ts:184`.

Tombol retry hanya muncul ketika log terakhir berstatus gagal; backend juga mensyaratkan log tersebut. Jika proses mati sebelum log dibuat, log gagal disimpan, atau admin dulu menonaktifkan pengiriman, UI tidak menyediakan cara mengirim pemberitahuan dari status saat ini.

Perbaikan: gunakan pekerjaan email persisten dan sediakan aksi kirim yang dapat diaudit untuk keputusan yang belum diberitahukan.

### 13. P2 — Retry email belum aman dari pengiriman bersamaan

Lokasi: `lib/email.ts:184`, `app/api/email/retry/route.ts`.

Dua admin/request dapat sama-sama membaca log terakhir gagal, lalu keduanya mengirim email sebelum log sukses terbentuk. Tidak ada klaim pekerjaan atomik, kunci idempotensi, atau status sedang diproses.

Perbaikan: klaim satu pekerjaan email secara atomik dan tentukan kebijakan deduplikasi. Perlu uji konkurensi.

### 14. P2 — Email tidak terikat pada snapshot peristiwa keputusan

Lokasi: `lib/email.ts:105`, `:186`, `:203`, dan pembacaan status awal di API aksi peserta.

Log hanya menyimpan tipe dan hasil kirim. Pengiriman membaca data applicant saat ini; retry perubahan jadwal mengambil aktivitas perubahan jadwal paling baru. Jika terjadi beberapa perubahan berdekatan, email yang diulang tidak mempunyai hubungan pasti dengan peristiwa atau rentang tanggal aslinya.

Perbaikan: simpan event ID dan snapshot penerima, keputusan, divisi serta jadwal pada pekerjaan email.

### 15. P2 — Berkas sementara bisa tertinggal

Lokasi: alur unggah pada form online/manual, kedua API pendaftaran, dan kedua helper tiket.

Unggahan dan finalisasi merupakan proses terpisah. Menutup tab, putus jaringan, atau habisnya tiket 15 menit setelah unggah dapat meninggalkan objek tanpa applicant. Cleanup bergantung pada browser atau beberapa jalur error; tidak ditemukan proses pembersihan berkala dalam repository. Jalur cleanup online juga mengabaikan hasil error remove tetapi tetap mengembalikan cleaned: true.

Perbaikan: catat sesi unggahan sementara, jalankan pembersihan berdasarkan umur/status, dan periksa hasil operasi penghapusan.

### 16. P2 — Aturan tanggal publik belum dibedakan dari input historis admin

Lokasi: `lib/tanggal.ts`, `app/api/daftar/upload/route.ts`, form pendaftaran publik.

Validator hanya memeriksa durasi; tanggal mulai dan selesai yang seluruhnya sudah lewat tetap valid. Input manual memang menjelaskan dukungan tanggal masa lalu, tetapi aturan khusus pendaftaran publik tidak ada.

Pemeriksaan langsung: `isDurasiMagangValid('2020-01-01', '2020-02-01')` menghasilkan true. Perlu dipastikan apakah publik memang boleh mengajukan data historis. Jika tidak, tambahkan batas tanggal di server dan UI publik.

### 17. P2 — Ketentuan maksimum 12 bulan berbeda dengan validasi 366 hari

Lokasi: `app/page.tsx`, `lib/tanggal.ts`, constraint database.

Beranda menyebut paling lama 12 bulan; kode memakai selisih maksimal 366 hari. `2025-01-01` sampai `2026-01-02` diterima validator meskipun lebih dari 12 bulan kalender. Perhitungan hari juga memakai selisih tanggal, sedangkan okupansi kuota menghitung kedua tanggal secara inklusif.

Perbaikan: tetapkan definisi durasi resmi dan samakan keterangan, validasi, laporan, dan aturan kuota.

### 18. P2 — Validasi form publik tidak memberi tahu kolom yang salah

Lokasi: `app/api/daftar/upload/route.ts:36`, `app/daftar/registration-form.tsx`.

Nama, kampus, dan jurusan diwajibkan minimal dua karakter setelah trim di server, tetapi UI hanya memakai required/maxLength. Input satu karakter lolos browser dan ditolak dengan pesan umum 'Periksa data dan berkas pendaftaran'. Email juga tidak dinormalisasi dengan trim.

Perbaikan: samakan aturan klien/server dan kembalikan error per kolom agar pengguna dapat memperbaikinya.

### 19. P2 — Form publik belum memeriksa ukuran/jenis berkas sebelum request

Lokasi: `app/daftar/registration-form.tsx:92`.

Form manual memeriksa MIME dan ukuran lokal, tetapi form publik hanya memeriksa instance File. Atribut accept hanyalah petunjuk pemilih berkas. Berkas kosong, terlalu besar, atau tidak sesuai baru ditolak oleh API dengan pesan umum setelah pengguna melakukan submit.

Perbaikan: tambahkan validasi lokal dengan pesan CV/surat yang spesifik; validasi server tetap dipertahankan.

### 20. P2 — UI retry email tidak menyegarkan riwayat

Lokasi: `app/admin/pemagang/[id]/retry-email.tsx`.

Setelah email terkirim, komponen hanya mengubah teks pesan. Riwayat dari server tetap gagal dan panel retry masih terlihat sampai halaman dimuat ulang. Klik berikutnya dapat ditolak backend meskipun tombol masih tersedia.

Perbaikan: refresh data server setelah hasil retry atau sinkronkan state riwayat dan panel.

### 21. P2 — Penanganan kegagalan login belum lengkap

Lokasi: `app/admin/login/login-form.tsx:25`.

Pembuatan client dibungkus try/catch, tetapi await signInWithPassword dan navigasi berada di luar try/finally. Jika operasi melempar exception yang tidak dikembalikan sebagai objek error, status submitting tidak dipulihkan dan tombol dapat terus menampilkan 'Memeriksa'.

Perbaikan: bungkus seluruh proses asinkron dengan try/catch/finally dan tampilkan pesan sesuai jenis kegagalan.

### 22. P2 — Pagination belum mempunyai pengurutan unik yang stabil

Lokasi: pengurutan di `app/admin/pemagang/page.tsx` dan `app/api/export/route.ts`.

Urutan nama hanya memakai nama; urutan terbaru hanya created_at; urutan tanggal mulai juga belum berakhir dengan ID unik. Data bernilai sama tidak mempunyai urutan deterministik sehingga pagination bisa menampilkan baris berulang atau terlewat. Offset pagination juga sensitif terhadap data baru selama pengguna berpindah halaman.

Perbaikan: tambahkan tie-breaker ID dan pertimbangkan cursor untuk daftar yang sering berubah.

### 23. P2 — Informasi kuota lokal bisa tetap memakai jumlah terisi lama

Lokasi: `app/admin/slot/slot-manager.tsx`.

Setelah PATCH, UI menghitung sisa dari nilai terisi yang dimuat sebelumnya. Jika admin lain menerima peserta selama halaman terbuka, kuota baru bisa benar tetapi jumlah terisi dan sisa yang ditampilkan sudah kedaluwarsa.

Perbaikan: muat ulang ringkasan kapasitas dari database setelah mutasi.

### 24. P2 — Modal aksi belum mengelola fokus keyboard

Lokasi: `app/admin/pemagang/[id]/applicant-actions.tsx`.

Modal memiliki role dialog dan aria-modal, tetapi tidak memindahkan fokus saat dibuka, membatasi tab di dalam dialog, mengembalikan fokus setelah ditutup, atau menyediakan penutupan dengan Escape. Keyboard masih bisa menjangkau kontrol di belakang modal. Dampak visual dan pembaca layar perlu diverifikasi di browser.

Perbaikan: gunakan komponen dialog yang menangani fokus dan keyboard dengan benar.

## Risiko yang memerlukan verifikasi layanan

### 25. P2 — Validasi unggahan memercayai metadata MIME

Lokasi: `app/api/daftar/route.ts:33`, `app/api/pemagang/manual/route.ts:151`.

Kode memeriksa ukuran dan MIME dari metadata Storage, tanpa inspeksi isi/magic bytes atau pemindaian dokumen. Metadata yang cocok tidak membuktikan konten merupakan PDF/gambar yang benar atau aman dibuka admin. Bucket privat dan signed URL sudah digunakan; tidak ditemukan endpoint anonim untuk membaca berkas peserta.

Perbaikan: validasi signature konten dan pertimbangkan pemindaian berkas sesuai kebutuhan operasional. Ini risiko unggahan, bukan bukti eksekusi kode.

### 26. P2 — Tidak ada pembatasan laju di lapisan aplikasi

Lokasi: endpoint pendaftaran, unggah, retry email, dan ekspor.

Pendaftaran dilindungi reCAPTCHA, tetapi tidak ada rate limit atau batas pemakaian per IP/pendaftar dalam kode. Endpoint admin dibatasi autentikasi, tetapi belum membatasi operasi berat/pengiriman berulang. Perlindungan gateway, Supabase Auth, dan hosting belum diperiksa sehingga belum dapat disimpulkan layanan produksi tanpa perlindungan.

Perbaikan: tentukan batas operasional dan terapkan di lapisan yang sesuai, dengan mempertimbangkan perlindungan penyedia yang sudah ada.

### 27. P3 — Pemeriksaan asal request mutasi belum konsisten

Lokasi: API aksi/manual/pendaftaran dibanding `app/api/email/retry/route.ts`, `app/api/admin/slot/route.ts`, dan `app/api/admin/logout/route.ts`.

Sebagian endpoint memeriksa Origin, sebagian tidak. Penggunaan JSON, PATCH, dan kebijakan cookie memberi perlindungan tambahan, sehingga ini bukan bukti bahwa semua endpoint tersebut dapat diserang CSRF. Jalur logout menerima POST tanpa validasi Origin.

Perbaikan: satukan kebijakan validasi asal request dan uji dengan konfigurasi cookie/domain deployment sebenarnya.

## Kelengkapan produk, dokumentasi, dan pemeliharaan

### 28. P2 — Persyaratan Node.js di README terlalu rendah

Lokasi: `README.md:16`, `package-lock.json:1597`.

README menyebut Node.js 20.9+, sedangkan @supabase/supabase-js 2.117.2 dan beberapa paket terkait yang terkunci mensyaratkan Node.js >=22.0.0. package.json juga belum menetapkan engines untuk proyek.

Perbaikan: dokumentasikan dan tetapkan runtime yang memenuhi seluruh dependensi, termasuk pada CI/deployment.

### 29. P2 — Dokumentasi rute dan migrasi belum sesuai repository

Lokasi: `README.md:121`, pesan error detail/daftar peserta.

README mencantumkan /admin/verifikasi/[id], tetapi implementasi detail yang tersedia berada di /admin/pemagang/[id]. Pesan error meminta 'migrasi database Tugas B1', tetapi tidak ada migrasi bernama demikian. Pengguna baru tidak mempunyai petunjuk konkret untuk memulihkan fitur yang gagal.

Perbaikan: perbarui daftar rute dan sediakan satu jalur setup/migrasi yang dapat diuji dari awal.

### 30. P2 — Tidak ada pengujian otomatis atau workflow CI dalam repository

Lokasi: `package.json` dan inventaris berkas.

Tidak ditemukan test suite, script test, atau workflow CI. Perilaku paling penting—kuota bersamaan, duplikat, perubahan status, finalisasi/cleanup unggahan, dan email—belum mempunyai regresi otomatis. Lint saja tidak mendeteksi skema SQL yang tertinggal.

Perbaikan: prioritaskan integration test database dan API untuk invariant tersebut; jalankan lint, typecheck/build dan tes pada CI.

### 31. P3 — Tipe database dan aturan bersama belum terpusat

Lokasi: `lib/types.ts`, query Supabase, form/API online dan manual, filter daftar/ekspor.

Tidak ada tipe Supabase hasil generate yang dipakai untuk memvalidasi nama tabel/kolom/RPC. Ini membuat referensi kolom yang tidak ada mudah lolos pemeriksaan statis. ApplicantActivityAction juga belum mencakup ubah_divisi walaupun aksi itu ditulis API. Validasi pendaftar, tipe kapasitas, logika filter dan header/footer admin berulang di beberapa berkas.

Perbaikan: gunakan tipe database yang sesuai migrasi dan pusatkan schema, filter serta layout bersama.

### 32. P3 — Ada dependensi dan CSS lama yang tidak dipakai kode aktif

Lokasi: package.json dan app/globals.css.

Tidak ditemukan import date-fns, react-hook-form, dan @hookform/resolvers dalam kode sumber aplikasi. CSS masih memuat kelompok vision/news/home dan document-card yang tidak dipakai markup saat ini, serta beberapa override responsif layout lama. Ini menambah pekerjaan pembaruan dan mempersulit pemeliharaan; bukan berarti seluruh dependensi itu otomatis masuk bundle browser.

Perbaikan: hapus yang tidak diperlukan setelah verifikasi referensi dan pisahkan gaya komponen yang masih digunakan.

### 33. P3 — Identitas instansi dan konten publik belum konsisten/selesai

Lokasi: README, components/public-layout.tsx, app/page.tsx, app/ketentuan/page.tsx, app/kontak/page.tsx.

README dan footer admin menyebut Kantor Pertanahan Kota Yogyakarta, sedangkan beranda/footer publik/peta merujuk Kantor Wilayah BPN D.I. Yogyakarta. Keduanya perlu dipastikan sebagai instansi tujuan yang benar. Beranda masih memakai placeholder poster/infografis; ketentuan menyebut dirinya rancangan, dan ada elemen h2 kosong. Telepon serta email kontak belum tersedia.

Perbaikan: tetapkan identitas instansi, isi informasi resmi, ganti placeholder dan rapikan struktur heading. Alamat aktual tidak diverifikasi dalam pemeriksaan ini.

### 34. P3 — Halaman survei belum menyediakan survei

Lokasi: app/survey/page.tsx.

Halaman mengajak pengguna mengisi survei, tetapi belum mempunyai formulir atau tautan survei. Tombol akhirnya menuju halaman kontak yang juga belum menyediakan kanal email/telepon.

Perbaikan: hubungkan ke survei resmi atau jelaskan status ketersediaannya secara jelas.

### 35. P3 — Bukti dan pelacakan pendaftaran bagi pengguna belum lengkap

Lokasi: app/daftar/registration-form.tsx dan inventaris rute publik.

Setelah berhasil, pengguna hanya mendapat ID dalam pesan pada halaman. Tidak ada tanda terima yang bisa diunduh, email konfirmasi awal, atau halaman pengecekan status. Memuat ulang halaman menghilangkan pesan. Ini kekurangan produk, bukan bug bila pelacakan memang di luar ruang lingkup awal.

Perbaikan: sediakan bukti pengiriman yang tahan reload dan, jika dibutuhkan, pelacakan dengan verifikasi identitas yang tidak mengekspos data peserta lain.

### 36. P3 — Informasi pemrosesan dan retensi data belum diwujudkan di aplikasi

Lokasi: form pendaftaran, kebijakan pada README, inventaris rute.

Form mengumpulkan identitas dan dokumen pribadi, tetapi yang ditautkan hanya kebijakan Google reCAPTCHA. Tidak ditemukan halaman kebijakan portal, penjelasan masa simpan/penghapusan, atau proses retensi pada kode. README sudah menyebut kebutuhan tersebut sebelum menerima pendaftaran. Ini temuan kelengkapan produk dan tata kelola, bukan penilaian kepatuhan hukum.

Perbaikan: sepakati kebijakan dengan pengelola, tampilkan informasi pemrosesan data, dan implementasikan retensi yang telah ditetapkan.

## Bukti pemeriksaan helper

Dijalankan pada Node.js v22.19.0 menggunakan --experimental-strip-types:

```text
isDurasiMagangValid('2020-01-01', '2020-02-01') -> true
isDurasiMagangValid('2025-01-01', '2026-01-02') -> true
tanggalMinimumSelesai('2026-01-31') -> '2026-02-28'
escapeApplicantSearchTerm('Kampus (A)') -> 'Kampus (A)'
escapeApplicantSearchTerm('*') -> '*'
```

Hasil minimum akhir bulan benar pada contoh yang diperiksa. Tidak semua input tanggal sudah diuji.

## Rujukan perilaku layanan

- [Supabase select: batas default hasil 1.000 baris](https://supabase.com/docs/reference/javascript/select).
- [PostgreSQL: unique constraints dan nilai NULL](https://www.postgresql.org/docs/current/ddl-constraints.html).
- [PostgREST: reserved characters pada grammar filter](https://docs.postgrest.org/en/v16/references/api/url_grammar.html).

## Urutan perbaikan

1. Lengkapi dan uji skema/migrasi, lalu pastikan fitur detail, email, dokumen, pembatalan dan jadwal bekerja.
2. Perbaiki duplikat, lifecycle berkas, idempotensi dan jalur mutasi yang dapat melewati aturan kuota.
3. Perbaiki perhitungan dashboard, pagination verifikasi, ekspor lengkap dan filter pencarian.
4. Buat outbox email, audit transaksional, dan tes konkurensi/regresi.
5. Selesaikan validasi/UI, dokumentasi runtime, informasi publik, survei dan kebijakan data.
