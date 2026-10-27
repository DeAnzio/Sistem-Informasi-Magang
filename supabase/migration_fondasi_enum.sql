-- Jalankan terpisah SEBELUM migration_fondasi.sql agar nilai enum sudah committed.
alter type public.status_pendaftar add value if not exists 'dibatalkan';
