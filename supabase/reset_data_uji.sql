-- KHUSUS database yang seluruh data pesertanya telah dinyatakan sebagai data uji.
-- Terpisah dari migrasi; tidak pernah dijalankan otomatis oleh aplikasi.
-- Menghapus semua peserta, aktivitas, log kirim, sesi unggahan, dan audit kuota.
-- Mempertahankan tabel, fungsi, kebijakan, akun admin/Auth, divisi dan nilai kuotanya.
-- Berkas fisik di bucket Storage harus dihapus melalui Dashboard/Storage API.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.applicants in exclusive mode;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'aktivitas_pendaftar', 'email_logs', 'sesi_unggahan', 'aktivitas_kuota'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('delete from public.%I', v_table);
    end if;
  end loop;
end $$;

delete from public.applicants;
commit;

select
  (select count(*) from public.applicants) as peserta_tersisa,
  (select count(*) from public.admins) as akun_admin_dipertahankan,
  (select count(*) from public.divisi) as divisi_dipertahankan;
