-- Jalankan hanya di staging. Baca-saja; bukan skrip migrasi.
-- Satu result set agar SQL Editor menampilkan seluruh bagian bersama-sama.
begin transaction read only;

with ringkasan as (
  select jsonb_build_object(
    'jumlah_pendaftar', count(*),
    'tanggal_tidak_valid', count(*) filter (where tanggal_mulai is null or tanggal_selesai is null
      or tanggal_selesai < (tanggal_mulai + interval '1 month')::date
      or tanggal_selesai - tanggal_mulai > 366),
    'telepon_perlu_ditinjau', count(*) filter (where no_hp is null
      or regexp_replace(no_hp, '[[:space:]-]', '', 'g') !~ '^08[0-9]{8,11}$'),
    'email_kosong', count(*) filter (where email is null or btrim(email) = '')
  ) as detail
  from public.applicants
), duplikat as (
  select count(*) as jumlah from (
    select lower(btrim(email)) from public.applicants
    where status::text in ('pending','diperiksa','perbaikan','diterima','tunggu')
    group by lower(btrim(email)) having count(*) > 1
  ) d
)
select '01_data' as bagian, 'ringkasan_tanpa_identitas' as objek,
  (r.detail || jsonb_build_object('kelompok_email_aktif_duplikat', d.jumlah))::text as detail
from ringkasan r cross join duplikat d
union all
select '02_rls', c.relname, jsonb_build_object('aktif',c.relrowsecurity,'force',c.relforcerowsecurity)::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
union all
select '03_policy', tablename || '.' || policyname,
  jsonb_build_object('roles',roles,'cmd',cmd,'using',qual,'check',with_check)::text
from pg_policies where schemaname='public'
union all
select '04_izin_tabel', table_name,
  jsonb_build_object('role',grantee,'izin',privilege_type)::text
from information_schema.table_privileges
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')
union all
select '05_fungsi', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in (
  'is_admin','hari_ini','okupansi_maksimum','sisa_kuota_rentang','get_slot_info',
  'jaga_integritas_pendaftar','jaga_kuota_divisi','terima_pendaftar','tolak_pendaftar',
  'batalkan_pendaftar','ubah_jadwal_pemagang','ubah_divisi_pendaftar','ubah_kuota_divisi',
  'simpan_pendaftaran','batalkan_unggahan'
)
order by bagian, objek, detail;

commit;
