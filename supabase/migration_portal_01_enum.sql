-- STAGING: jalankan terpisah dan tunggu commit sebelum file 02.
-- Tidak mengubah status baris yang sudah ada.
begin;
alter type public.status_pendaftar add value if not exists 'perbaikan';
alter type public.status_pendaftar add value if not exists 'diperiksa';
alter type public.status_pendaftar add value if not exists 'tunggu';
alter type public.status_pendaftar add value if not exists 'selesai';
commit;
