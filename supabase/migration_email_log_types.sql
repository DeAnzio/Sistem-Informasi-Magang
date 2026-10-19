begin;

alter table public.email_logs
  drop constraint if exists email_logs_tipe_check;

alter table public.email_logs
  add constraint email_logs_tipe_check
  check (tipe in ('diterima', 'ditolak', 'dibatalkan', 'jadwal_diubah'));

commit;
