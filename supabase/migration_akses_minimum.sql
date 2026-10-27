-- Perbaikan izin tabel yang SUDAH ADA, tanpa menghapus data/struktur.
-- Dapat dijalankan sebelum migrasi fondasi; aturan yang sama ada pada fondasi.
-- Perubahan peserta/kuota tetap melalui API server (service_role).
begin;
revoke all privileges on public.admins,public.applicants,public.divisi,public.aktivitas_pendaftar
  from public,anon,authenticated;
grant select on public.divisi to anon,authenticated;
grant select on public.admins,public.applicants,public.aktivitas_pendaftar to authenticated;
grant all privileges on public.admins,public.applicants,public.divisi,public.aktivitas_pendaftar to service_role;
commit;

select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('admins','applicants','divisi','aktivitas_pendaftar')
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name,grantee,privilege_type;
