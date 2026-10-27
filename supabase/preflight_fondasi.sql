-- Pemeriksaan sebelum migrasi. Tidak mengubah skema, data, atau izin.
-- Jalankan sebagai pemilik database melalui SQL Editor Supabase.
-- Jangan jalankan bersamaan dengan sesi transaksi lain dalam editor yang sama.
begin transaction isolation level repeatable read read only;

select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in
  ('admins','divisi','applicants','periode','slots','aktivitas_pendaftar','sesi_unggahan','email_logs')
order by table_name, ordinal_position;

select t.typname, e.enumlabel
from pg_type t join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'status_pendaftar'
order by e.enumsortorder;

select p.proname, pg_get_function_identity_arguments(p.oid) as argumen
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_admin','hari_ini','get_slot_info',
  'terima_pendaftar','tolak_pendaftar','batalkan_pendaftar','ubah_jadwal_pemagang',
  'ubah_divisi_pendaftar','ubah_kuota_divisi','simpan_pendaftaran','batalkan_unggahan')
order by p.proname;

select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename in ('admins','applicants','divisi','aktivitas_pendaftar','sesi_unggahan')
order by tablename, policyname;

-- Hanya jumlah masalah dan ID divisi, tanpa nama/email/NIM peserta.
-- MISSING/LEGACY berarti pemeriksaan data belum lengkap, bukan berarti aman.
do $$
declare
  v_report jsonb := '{}'::jsonb;
  v_count bigint;
  v_rows jsonb;
  v_ready boolean;
begin
  if to_regclass('public.applicants') is null or to_regclass('public.divisi') is null then
    raise notice 'FONDASI_PREFLIGHT %', jsonb_build_object('status','MISSING','detail','Tabel applicants/divisi belum lengkap');
    return;
  end if;
  select count(*) = 5 into v_ready from information_schema.columns
    where table_schema = 'public' and table_name = 'applicants'
      and column_name in ('nim','divisi_id','tanggal_mulai','tanggal_selesai','status');
  if not v_ready or not exists(select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'divisi' and column_name = 'kuota') then
    raise notice 'FONDASI_PREFLIGHT %', jsonb_build_object('status','LEGACY','detail','Perlu tinjau migrasi kapasitas/periode terlebih dahulu');
    return;
  end if;
  execute 'select count(*) from (select nim,tanggal_mulai from public.applicants where divisi_id is null group by nim,tanggal_mulai having count(*)>1) d' into v_count;
  v_report := v_report || jsonb_build_object('kelompok_duplikat_tanpa_divisi',v_count);
  execute 'select count(*) from (select nim,divisi_id,tanggal_mulai from public.applicants where divisi_id is not null group by nim,divisi_id,tanggal_mulai having count(*)>1) d' into v_count;
  v_report := v_report || jsonb_build_object('kelompok_duplikat_dengan_divisi',v_count);
  execute 'select count(*) from public.applicants where tanggal_mulai is null or tanggal_selesai is null or tanggal_selesai < (tanggal_mulai + interval ''1 month'')::date or tanggal_selesai-tanggal_mulai>366' into v_count;
  v_report := v_report || jsonb_build_object('jadwal_tidak_valid',v_count);
  execute 'select count(*) from public.applicants a left join public.divisi d on d.id=a.divisi_id where a.status::text=''diterima'' and (a.divisi_id is null or d.id is null)' into v_count;
  v_report := v_report || jsonb_build_object('diterima_tanpa_penempatan_valid',v_count);
  execute 'select count(*) from public.applicants where status::text not in (''pending'',''diterima'',''ditolak'',''dibatalkan'')' into v_count;
  v_report := v_report || jsonb_build_object('status_tidak_dikenal',v_count);
  execute $q$
    with events as (
      select divisi_id,tanggal_mulai as hari,1 as perubahan from public.applicants
        where status::text='diterima' and divisi_id is not null and tanggal_selesai>=tanggal_mulai
      union all
      select divisi_id,tanggal_selesai+1,-1 from public.applicants
        where status::text='diterima' and divisi_id is not null and tanggal_selesai>=tanggal_mulai
    ), grouped as (select divisi_id,hari,sum(perubahan) as perubahan from events group by divisi_id,hari),
    running as (select divisi_id,sum(perubahan) over(partition by divisi_id order by hari) as jumlah from grouped),
    peaks as (select divisi_id,max(jumlah) as puncak from running group by divisi_id)
    select coalesce(jsonb_agg(jsonb_build_object('divisi_id',d.id,'kuota',d.kuota,'puncak',p.puncak)),'[]'::jsonb)
    from peaks p join public.divisi d on d.id=p.divisi_id where p.puncak>d.kuota
  $q$ into v_rows;
  v_report := v_report || jsonb_build_object('divisi_melebihi_kuota',v_rows);
  v_report := v_report || jsonb_build_object('status',case when
    (v_report->>'kelompok_duplikat_tanpa_divisi')::bigint=0 and
    (v_report->>'kelompok_duplikat_dengan_divisi')::bigint=0 and
    (v_report->>'jadwal_tidak_valid')::bigint=0 and
    (v_report->>'diterima_tanpa_penempatan_valid')::bigint=0 and
    (v_report->>'status_tidak_dikenal')::bigint=0 and jsonb_array_length(v_rows)=0
    then 'DATA_CHECKS_CLEAR' else 'REVIEW_REQUIRED' end);
  raise notice 'FONDASI_PREFLIGHT %',v_report;
end $$;
commit;
