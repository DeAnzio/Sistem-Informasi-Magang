-- Baca-saja, jalankan setelah ketiga file migrasi berhasil.
begin transaction read only;
select 'status' as bagian, 'status_pendaftar' as objek,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder) as hasil
from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typname='status_pendaftar'
union all
select 'data','jumlah_pendaftar',count(*)::text from public.applicants
union all
select 'kolom','nim_nullable',is_nullable from information_schema.columns
where table_schema='public' and table_name='applicants' and column_name='nim'
union all
select 'indeks',indexname,indexdef from pg_indexes
where schemaname='public' and indexname='applicants_email_aktif_unique'
union all
select 'tabel_baru',c.relname,'RLS='||c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'akses_pelacakan','dokumen_pendaftar','penyelesaian_magang','survei_magang','pengaturan_layanan') and c.relkind='r'
union all
select 'akses','anon_baca_hash',has_table_privilege('anon','public.akses_pelacakan','SELECT')::text
union all
select 'akses','authenticated_baca_hash',has_table_privilege('authenticated','public.akses_pelacakan','SELECT')::text
union all
select 'akses','authenticated_mutasi',has_function_privilege('authenticated','public.portal_kirim_perbaikan(uuid)','EXECUTE')::text
union all
select 'konfigurasi','pendaftaran_dibuka',pendaftaran_dibuka::text from public.pengaturan_layanan
union all
select 'fungsi',p.oid::regprocedure::text,'jumlah_default='||p.pronargdefaults::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='sisa_kuota_rentang'
order by bagian,objek;
commit;
