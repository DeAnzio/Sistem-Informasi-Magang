-- STAGING: setelah 01 dan 02. Backend produksi lama belum mendukung kontrak ini.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.okupansi_maksimum(p_divisi uuid,p_mulai date,p_selesai date,p_kecuali uuid default null)
returns int language sql volatile set search_path=public as $$
  with events as (
    select greatest(tanggal_mulai,p_mulai) hari,1 perubahan from public.applicants
    where divisi_id=p_divisi and status in ('diterima','selesai') and id is distinct from p_kecuali
      and tanggal_mulai<=p_selesai and tanggal_selesai>=p_mulai
    union all
    select least(tanggal_selesai,p_selesai)+1,-1 from public.applicants
    where divisi_id=p_divisi and status in ('diterima','selesai') and id is distinct from p_kecuali
      and tanggal_mulai<=p_selesai and tanggal_selesai>=p_mulai
  ), totals as (select hari,sum(perubahan) perubahan from events group by hari),
  running as (select sum(perubahan) over(order by hari) jumlah from totals)
  select coalesce(max(jumlah),0)::int from running;
$$;
-- Pertahankan signature lama, tetapi hapus default pada overload 4 parameter.
-- PostgreSQL tidak dapat menghapus default lewat CREATE OR REPLACE.
-- RESTRICT sengaja menghentikan transaksi bila ada dependensi tercatat;
-- jangan menggantinya dengan CASCADE. Signature dibuat ulang di transaksi ini.
drop function if exists public.sisa_kuota_rentang(uuid,date,date,uuid) restrict;
create or replace function public.sisa_kuota_rentang(p_divisi uuid,p_mulai date,p_selesai date,p_kecuali uuid)
returns int language sql volatile security definer set search_path=public as $$
  select kuota-public.okupansi_maksimum(id,p_mulai,p_selesai,p_kecuali)
  from public.divisi where id=p_divisi and aktif;
$$;
create or replace function public.sisa_kuota_rentang(p_divisi uuid,p_mulai date,p_selesai date)
returns int language sql volatile security definer set search_path=public as $$
  select public.sisa_kuota_rentang(p_divisi,p_mulai,p_selesai,null::uuid);
$$;

create or replace function public.get_slot_info()
returns table(divisi_id uuid,divisi_nama text,urutan int,kuota int,terisi int,terjadwal int,sisa int,status text)
language sql stable security definer set search_path=public as $$
  select d.id,d.nama,d.urutan,d.kuota,c.sekarang::int,c.mendatang::int,
    greatest(d.kuota-c.sekarang,0)::int,
    case when d.kuota-c.sekarang>0 then 'tersedia' else 'penuh' end
  from public.divisi d cross join lateral (
    select count(*) filter(where public.hari_ini() between a.tanggal_mulai and a.tanggal_selesai) sekarang,
      count(*) filter(where a.tanggal_mulai>public.hari_ini()) mendatang
    from public.applicants a where a.divisi_id=d.id and a.status in ('diterima','selesai')
  ) c where d.aktif order by d.urutan;
$$;

create or replace function public.jaga_integritas_pendaftar()
returns trigger language plpgsql set search_path=public as $$
declare v_kuota int; v_aktif boolean; v_notes record;
begin
  if tg_op='INSERT' then
    if new.status<>'pending' then raise exception 'status_awal_tidak_valid' using errcode='23514'; end if;
    new.email:=lower(btrim(new.email));
    new.no_hp:=regexp_replace(new.no_hp,'[[:space:]-]','','g');
  else
    if new.email is distinct from old.email then new.email:=lower(btrim(new.email)); end if;
    if new.no_hp is distinct from old.no_hp then new.no_hp:=regexp_replace(new.no_hp,'[[:space:]-]','','g'); end if;
    if old.status='selesai' and (new.status is distinct from old.status or new.divisi_id is distinct from old.divisi_id
      or new.tanggal_mulai is distinct from old.tanggal_mulai or new.tanggal_selesai is distinct from old.tanggal_selesai) then
      raise exception 'riwayat_selesai_tidak_boleh_diubah' using errcode='23514';
    end if;
    if new.status is distinct from old.status and not (
      (old.status in ('pending','diperiksa') and new.status in ('perbaikan','diterima','ditolak','tunggu','dibatalkan')) or
      (old.status='perbaikan' and new.status in ('diperiksa','ditolak','dibatalkan')) or
      (old.status='tunggu' and new.status in ('diterima','perbaikan','ditolak','dibatalkan')) or
      (old.status='diterima' and new.status in ('dibatalkan','selesai')) or
      (old.status in ('ditolak','dibatalkan') and new.status='pending')
    ) then raise exception 'status_tidak_valid' using errcode='23514'; end if;
  end if;
  if new.tanggal_selesai < (new.tanggal_mulai+interval '1 month')::date
    or new.tanggal_selesai-new.tanggal_mulai>366 then
    raise exception 'tanggal_tidak_valid' using errcode='23514';
  end if;
  if jsonb_typeof(new.catatan_perbaikan)<>'object' then raise exception 'catatan_perbaikan_tidak_valid' using errcode='23514'; end if;
  for v_notes in select * from jsonb_each(new.catatan_perbaikan) loop
    if v_notes.key not in ('cv','surat') or jsonb_typeof(v_notes.value)<>'string'
      or length(btrim(v_notes.value #>> '{}')) not between 1 and 1000 then
      raise exception 'catatan_perbaikan_tidak_valid' using errcode='23514';
    end if;
  end loop;
  if tg_op='UPDATE' and new.status='perbaikan' and (new.status is distinct from old.status
    or new.catatan_perbaikan is distinct from old.catatan_perbaikan) then
    if new.catatan_perbaikan='{}'::jsonb then raise exception 'catatan_perbaikan_wajib' using errcode='23514'; end if;
    new.perbaikan_diminta_at:=clock_timestamp();
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status in ('perbaikan','ditolak','dibatalkan','tunggu') and btrim(new.pesan_pendaftar)='' then
      raise exception 'pesan_wajib_diisi' using errcode='23514'; end if;
    if new.status='perbaikan' then
      if new.catatan_perbaikan='{}'::jsonb then raise exception 'catatan_perbaikan_wajib' using errcode='23514'; end if;
      new.perbaikan_diminta_at:=clock_timestamp();
    end if;
    if new.status in ('diterima','tunggu') and not (new.pemeriksaan @>
      '{"identity":true,"cv":true,"surat":true,"schedule":true}'::jsonb) then
      raise exception 'pemeriksaan_belum_lengkap' using errcode='23514'; end if;
    if new.status='diperiksa' then
      if old.perbaikan_diminta_at is null or old.catatan_perbaikan='{}'::jsonb then
        raise exception 'permintaan_perbaikan_tidak_valid' using errcode='23514'; end if;
      for v_notes in select * from jsonb_each(old.catatan_perbaikan) loop
        if not exists(select 1 from public.dokumen_pendaftar where applicant_id=new.id and jenis=v_notes.key
          and created_at>old.perbaikan_diminta_at) then
          raise exception 'berkas_perbaikan_belum_lengkap' using errcode='23514'; end if;
      end loop;
      new.pemeriksaan:='{"identity":false,"cv":false,"surat":false,"schedule":false}';
    end if;
    if new.status='selesai' then
      if new.tanggal_selesai>public.hari_ini() or not exists(select 1 from public.penyelesaian_magang
        where applicant_id=new.id and status='approved') then
        raise exception 'penyelesaian_belum_valid' using errcode='23514'; end if;
    end if;
    if new.status='tunggu' then new.daftar_tunggu_at:=clock_timestamp(); end if;
  end if;
  if new.status='diterima' or (new.status='tunggu' and (tg_op='INSERT' or old.status is distinct from new.status
    or new.divisi_id is distinct from old.divisi_id or new.tanggal_mulai is distinct from old.tanggal_mulai
    or new.tanggal_selesai is distinct from old.tanggal_selesai)) then
    if new.divisi_id is null then raise exception 'divisi_belum_dipilih' using errcode='23514'; end if;
    select kuota,aktif into v_kuota,v_aktif from public.divisi where id=new.divisi_id for update;
    if not coalesce(v_aktif,false) then raise exception 'divisi_tidak_tersedia' using errcode='23514'; end if;
    if new.status='diterima' and public.okupansi_maksimum(new.divisi_id,new.tanggal_mulai,new.tanggal_selesai,new.id)>=v_kuota then
      raise exception 'kuota_penuh' using errcode='23514'; end if;
    if new.status='tunggu' and public.okupansi_maksimum(new.divisi_id,new.tanggal_mulai,new.tanggal_selesai,new.id)<v_kuota then
      raise exception 'kuota_masih_tersedia' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create or replace function public.jaga_kuota_divisi()
returns trigger language plpgsql set search_path=public as $$
declare v_first date; v_last date;
begin
  if new.kuota<0 or new.kuota>500 then raise exception 'kuota_tidak_valid' using errcode='23514'; end if;
  select min(tanggal_mulai),max(tanggal_selesai) into v_first,v_last from public.applicants
    where divisi_id=new.id and status in ('diterima','selesai');
  if v_first is not null and new.kuota<public.okupansi_maksimum(new.id,v_first,v_last) then
    raise exception 'kuota_kurang_dari_terisi' using errcode='23514'; end if;
  return new;
end $$;

create or replace function public.portal_jaga_dokumen()
returns trigger language plpgsql set search_path=public as $$
declare a public.applicants; v_next int;
begin
  select * into a from public.applicants where id=new.applicant_id for update;
  if not found then raise exception 'pendaftar_tidak_ditemukan'; end if;
  if tg_op='UPDATE' then raise exception 'versi_dokumen_tidak_boleh_ditimpa'; end if;
  if (new.jenis in ('cv','surat') and a.status not in ('pending','perbaikan'))
    or (new.jenis='laporan' and a.status<>'diterima') then raise exception 'status_unggahan_tidak_valid'; end if;
  select coalesce(max(versi),0)+1 into v_next from public.dokumen_pendaftar
    where applicant_id=new.applicant_id and jenis=new.jenis;
  if new.versi<>v_next then raise exception 'versi_dokumen_tidak_valid'; end if;
  if not exists(select 1 from storage.objects where bucket_id='berkas' and name=new.storage_path
    and metadata->>'mimetype'=new.mime_type and (metadata->>'size')::bigint=new.ukuran) then
    raise exception 'berkas_storage_tidak_valid'; end if;
  new.created_at:=clock_timestamp();
  return new;
end $$;
drop trigger if exists portal_dokumen_guard on public.dokumen_pendaftar;
create trigger portal_dokumen_guard before insert or update on public.dokumen_pendaftar
for each row execute function public.portal_jaga_dokumen();

create or replace function public.portal_jaga_penyelesaian()
returns trigger language plpgsql set search_path=public as $$
declare a public.applicants;
begin
  select * into a from public.applicants where id=new.applicant_id for update;
  if not found or a.status<>'diterima' then raise exception 'status_penyelesaian_tidak_valid'; end if;
  if not exists(select 1 from public.dokumen_pendaftar where id=new.dokumen_id
    and applicant_id=new.applicant_id and jenis='laporan') then raise exception 'laporan_tidak_valid'; end if;
  if tg_op='INSERT' and new.status<>'submitted' then raise exception 'laporan_harus_dikirim'; end if;
  if tg_op='UPDATE' then
    if not ((old.status='submitted' and new.status in ('revision','approved') and new.dokumen_id=old.dokumen_id)
      or (old.status='revision' and new.status='submitted' and new.dokumen_id<>old.dokumen_id)) then
      raise exception 'alur_laporan_tidak_valid'; end if;
  end if;
  if new.status in ('revision','approved') and (new.diperiksa_oleh is null or btrim(new.pesan)='') then
    raise exception 'pemeriksa_dan_pesan_wajib'; end if;
  if new.status='approved' then
    if a.tanggal_selesai>public.hari_ini() then raise exception 'periode_belum_selesai'; end if;
    new.approved_at:=clock_timestamp();
  else new.approved_at:=null;
  end if;
  if new.status='submitted' then new.submitted_at:=clock_timestamp(); new.diperiksa_oleh:=null; end if;
  return new;
end $$;
drop trigger if exists portal_penyelesaian_guard on public.penyelesaian_magang;
create trigger portal_penyelesaian_guard before insert or update on public.penyelesaian_magang
for each row execute function public.portal_jaga_penyelesaian();

create or replace function public.portal_jaga_survei()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' then raise exception 'survei_hanya_sekali'; end if;
  perform 1 from public.applicants where id=new.applicant_id and status='selesai' for update;
  if not found then raise exception 'survei_hanya_setelah_selesai'; end if;
  new.created_at:=clock_timestamp(); return new;
end $$;
drop trigger if exists portal_survei_guard on public.survei_magang;
create trigger portal_survei_guard before insert or update on public.survei_magang
for each row execute function public.portal_jaga_survei();

-- RPC berikut hanya untuk server setelah memverifikasi sesi admin.
-- p_admin bukan bukti autentikasi; browser tidak mendapat EXECUTE.
create or replace function public.portal_putuskan(p_id uuid,p_admin uuid,p_status public.status_pendaftar,
  p_divisi uuid,p_pesan text,p_catatan jsonb default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.status_pendaftar;
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  if p_status in ('selesai','diperiksa') or p_status is null then raise exception 'gunakan_alur_khusus'; end if;
  select status into v_old from public.applicants where id=p_id for update;
  if not found then raise exception 'pendaftar_tidak_ditemukan'; end if;
  if v_old='selesai' then raise exception 'riwayat_selesai_tidak_boleh_diubah'; end if;
  update public.applicants set status=p_status,divisi_id=p_divisi,pesan_pendaftar=coalesce(btrim(p_pesan),''),
    catatan_perbaikan=case when p_status='perbaikan' then p_catatan else '{}'::jsonb end,
    verified_by=p_admin,verified_at=now(),
    dibatalkan_at=case when p_status='dibatalkan' then now() else dibatalkan_at end,
    catatan_batal=case when p_status='dibatalkan' then p_pesan else catatan_batal end
  where id=p_id;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh) values(p_id,'portal_keputusan',
    jsonb_build_object('dari',v_old,'ke',p_status,'pesan',p_pesan,'catatan_perbaikan',p_catatan),p_admin);
end $$;

create or replace function public.portal_kirim_perbaikan(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  -- Server memverifikasi kode pelacakan sebelum memanggil RPC ini.
  update public.applicants set status='diperiksa',pesan_pendaftar='Berkas perbaikan menunggu pemeriksaan.'
    where id=p_id and status='perbaikan';
  if not found then raise exception 'status_perbaikan_tidak_valid'; end if;
  insert into public.aktivitas_pendaftar(applicant_id,aksi) values(p_id,'portal_kirim_perbaikan');
end $$;

create or replace function public.portal_periksa_laporan(p_id uuid,p_admin uuid,p_setujui boolean,p_pesan text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  if p_setujui is null then raise exception 'keputusan_tidak_valid'; end if;
  perform 1 from public.applicants where id=p_id and status='diterima' for update;
  if not found then raise exception 'status_penyelesaian_tidak_valid'; end if;
  update public.penyelesaian_magang set status=case when p_setujui then 'approved' else 'revision' end,
    pesan=btrim(p_pesan),diperiksa_oleh=p_admin where applicant_id=p_id and status='submitted';
  if not found then raise exception 'laporan_belum_dikirim'; end if;
  if p_setujui then update public.applicants set status='selesai',pesan_pendaftar=p_pesan where id=p_id; end if;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh)
    values(p_id,'portal_periksa_laporan',jsonb_build_object('disetujui',p_setujui,'pesan',p_pesan),p_admin);
end $$;

-- Cabut hak pada seluruh overload fungsi bisnis lama maupun fungsi portal baru.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (left(p.proname,7)='portal_' or p.proname in (
      'okupansi_maksimum','sisa_kuota_rentang','terima_pendaftar','tolak_pendaftar','batalkan_pendaftar',
      'ubah_jadwal_pemagang','ubah_divisi_pendaftar','ubah_kuota_divisi','simpan_pendaftaran','batalkan_unggahan',
      'jaga_integritas_pendaftar','jaga_kuota_divisi')) loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
