-- Baca-saja setelah file 04. Tidak mengubah data atau membuka pendaftaran.
begin transaction read only;
select 'tabel' bagian,c.relname objek,'RLS='||c.relrowsecurity::text hasil
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('portal_sesi_unggahan','portal_batas_permintaan')
union all
select 'fungsi',p.proname,
  'anon='||has_function_privilege('anon',p.oid,'EXECUTE')::text
  ||'; authenticated='||has_function_privilege('authenticated',p.oid,'EXECUTE')::text
  ||'; service_role='||has_function_privilege('service_role',p.oid,'EXECUTE')::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('portal_batasi','portal_finalisasi_unggahan','portal_simpan_pemeriksaan',
  'portal_simpan_pengaturan','portal_simpan_survei','portal_batalkan_sesi','portal_terbitkan_kode','portal_input_manual')
union all
select 'data','jumlah_pendaftar',count(*)::text from public.applicants
order by bagian,objek;
commit;
