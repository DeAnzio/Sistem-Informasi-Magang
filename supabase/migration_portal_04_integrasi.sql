-- Menambahkan transaksi unggahan dan pengaturan untuk API portal.
-- Jalankan hanya setelah 01–03, sebelum memakai aplikasi portal baru.
begin;
set local lock_timeout='5s';
create table if not exists public.portal_sesi_unggahan (
  id uuid primary key,
  applicant_id uuid not null,
  aksi text not null check(aksi in ('register','revise','final-report')),
  payload jsonb not null,
  status text not null default 'siap' check(status in ('siap','tersimpan','dibatalkan')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists portal_sesi_expiry_idx on public.portal_sesi_unggahan(status,expires_at);
create table if not exists public.portal_batas_permintaan (
  kunci text primary key, jumlah int not null, expires_at timestamptz not null
);
alter table public.portal_sesi_unggahan enable row level security;
alter table public.portal_batas_permintaan enable row level security;
revoke all on public.portal_sesi_unggahan,public.portal_batas_permintaan from public,anon,authenticated;
grant all on public.portal_sesi_unggahan,public.portal_batas_permintaan to service_role;

create or replace function public.portal_batasi(p_kunci text,p_limit int,p_detik int)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  if p_limit<1 or p_detik<1 or length(p_kunci)>128 then raise exception 'batas_tidak_valid'; end if;
  delete from public.portal_batas_permintaan where expires_at<now()-interval '1 day';
  insert into public.portal_batas_permintaan(kunci,jumlah,expires_at)
    values(p_kunci,1,now()+make_interval(secs=>p_detik))
  on conflict(kunci) do update set
    jumlah=case when portal_batas_permintaan.expires_at<=now() then 1 else least(portal_batas_permintaan.jumlah+1,p_limit+1) end,
    expires_at=case when portal_batas_permintaan.expires_at<=now() then now()+make_interval(secs=>p_detik) else portal_batas_permintaan.expires_at end
  returning jumlah into v_count;
  return v_count<=p_limit;
end $$;

create or replace function public.portal_finalisasi_unggahan(p_sesi uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.portal_sesi_unggahan; a public.applicants; cfg public.pengaturan_layanan;
  f jsonb; v_id uuid; v_doc uuid; v_versi int; v_field jsonb;
begin
  select * into s from public.portal_sesi_unggahan where id=p_sesi for update;
  if not found then raise exception 'tiket_tidak_valid'; end if;
  if s.status='tersimpan' then return s.applicant_id; end if;
  if s.status<>'siap' or s.expires_at<now() then raise exception 'tiket_tidak_valid'; end if;
  if s.aksi='register' then
    select * into cfg from public.pengaturan_layanan where id=true for share;
    if not found or not cfg.pendaftaran_dibuka or cfg.batas_pendaftaran<public.hari_ini() then
      raise exception 'pendaftaran_ditutup'; end if;
    v_field:=s.payload->'applicant';
    if not (s.payload->'files' @> '[{"kind":"cv"},{"kind":"surat"}]') then raise exception 'berkas_wajib'; end if;
    insert into public.applicants(id,nama,email,no_hp,asal_kampus,jurusan,tanggal_mulai,tanggal_selesai,pesan_pendaftar)
      values(s.applicant_id,v_field->>'nama',v_field->>'email',v_field->>'no_hp',v_field->>'asal_kampus',
        v_field->>'jurusan',(v_field->>'tanggal_mulai')::date,(v_field->>'tanggal_selesai')::date,
        'Pengajuan diterima dan menunggu pemeriksaan petugas.');
    insert into public.akses_pelacakan(applicant_id,token_hash) values(s.applicant_id,s.payload->>'token_hash');
  end if;
  select * into a from public.applicants where id=s.applicant_id for update;
  if not found then raise exception 'pendaftar_tidak_ditemukan'; end if;
  if s.aksi='revise' and a.status<>'perbaikan' then raise exception 'status_perbaikan_tidak_valid'; end if;
  if s.aksi='final-report' and (a.status<>'diterima' or exists(select 1 from public.penyelesaian_magang
    where applicant_id=a.id and status<>'revision')) then raise exception 'status_laporan_tidak_valid'; end if;
  if jsonb_array_length(s.payload->'files') not between 1 and 2 then raise exception 'berkas_tidak_valid'; end if;
  for f in select * from jsonb_array_elements(s.payload->'files') loop
    if (s.aksi='final-report' and f->>'kind'<>'laporan')
      or (s.aksi<>'final-report' and f->>'kind' not in ('cv','surat')) then raise exception 'jenis_berkas_tidak_valid'; end if;
    select coalesce(max(versi),0)+1 into v_versi from public.dokumen_pendaftar where applicant_id=a.id and jenis=f->>'kind';
    insert into public.dokumen_pendaftar(applicant_id,jenis,versi,storage_path,nama_asli,mime_type,ukuran)
      values(a.id,f->>'kind',v_versi,f->>'path',f->>'name',f->>'type',(f->>'size')::bigint) returning id into v_id;
    if f->>'kind'='laporan' then v_doc:=v_id; end if;
    if f->>'kind'='cv' then update public.applicants set berkas_cv=f->>'path' where id=a.id; end if;
    if f->>'kind'='surat' then update public.applicants set berkas_surat_pengantar=f->>'path' where id=a.id; end if;
  end loop;
  if s.aksi='revise' then perform public.portal_kirim_perbaikan(a.id);
  elsif s.aksi='final-report' then
    insert into public.penyelesaian_magang(applicant_id,dokumen_id) values(a.id,v_doc)
      on conflict(applicant_id) do update set dokumen_id=excluded.dokumen_id,status='submitted',pesan='Laporan menunggu pemeriksaan.';
    insert into public.aktivitas_pendaftar(applicant_id,aksi) values(a.id,'portal_kirim_laporan');
  else insert into public.aktivitas_pendaftar(applicant_id,aksi) values(a.id,'portal_daftar'); end if;
  update public.portal_sesi_unggahan set status='tersimpan' where id=s.id;
  return a.id;
end $$;

create or replace function public.portal_simpan_pemeriksaan(p_id uuid,p_admin uuid,p_review jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  update public.applicants set pemeriksaan=p_review where id=p_id and status<>'selesai';
  if not found then raise exception 'status_pemeriksaan_tidak_valid'; end if;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,oleh) values(p_id,'portal_pemeriksaan',p_admin);
end $$;

create or replace function public.portal_simpan_pengaturan(p_admin uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d jsonb; v_id uuid; v_result text;
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  perform 1 from public.pengaturan_layanan where id=true for update;
  for d in select * from jsonb_array_elements(p_settings->'divisions') order by value->>'name' loop
    select id into v_id from public.divisi where nama=d->>'name' and aktif;
    if not found then raise exception 'divisi_tidak_tersedia'; end if;
    v_result:=public.ubah_kuota_divisi(v_id,(d->>'quota')::int,p_admin);
    if v_result<>'ok' then raise exception '%',v_result; end if;
  end loop;
  update public.pengaturan_layanan set pendaftaran_dibuka=(p_settings->>'open')::boolean,
    batas_pendaftaran=nullif(p_settings->>'deadline','')::date,pengumuman=p_settings->>'announcement',
    kontak=p_settings->>'contact',updated_at=now(),updated_by=p_admin where id=true;
end $$;

create or replace function public.portal_simpan_survei(p_id uuid,p_scores int[],p_komentar text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if cardinality(p_scores)<>4 then raise exception 'survei_tidak_valid'; end if;
  insert into public.survei_magang(applicant_id,informasi,pendaftaran,pelayanan,pengalaman,komentar)
    values(p_id,p_scores[1],p_scores[2],p_scores[3],p_scores[4],p_komentar);
  insert into public.aktivitas_pendaftar(applicant_id,aksi) values(p_id,'portal_survei');
end $$;

create or replace function public.portal_terbitkan_kode(p_id uuid,p_admin uuid,p_hash text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  perform 1 from public.applicants where id=p_id for update;
  if not found then raise exception 'pendaftar_tidak_ditemukan'; end if;
  insert into public.akses_pelacakan(applicant_id,token_hash) values(p_id,p_hash)
    on conflict(applicant_id) do update set token_hash=excluded.token_hash,created_at=now(),revoked_at=null;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,oleh) values(p_id,'portal_kode_diperbarui',p_admin);
end $$;

create or replace function public.portal_input_manual(p_admin uuid,p_applicant jsonb,p_divisi uuid,p_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.admins where user_id=p_admin) then raise exception 'admin_tidak_valid'; end if;
  insert into public.applicants(nama,email,no_hp,asal_kampus,jurusan,tanggal_mulai,tanggal_selesai,divisi_id,sumber,pesan_pendaftar)
    values(p_applicant->>'nama',p_applicant->>'email',p_applicant->>'no_hp',p_applicant->>'asal_kampus',p_applicant->>'jurusan',
      (p_applicant->>'tanggal_mulai')::date,(p_applicant->>'tanggal_selesai')::date,p_divisi,'manual','Pengajuan dicatat petugas dan menunggu pemeriksaan.')
    returning id into v_id;
  insert into public.akses_pelacakan(applicant_id,token_hash) values(v_id,p_hash);
  insert into public.aktivitas_pendaftar(applicant_id,aksi,oleh) values(v_id,'input_manual',p_admin);
  return v_id;
end $$;

-- Cleanup mengunci sesi yang sama dengan finalisasi; tidak menghapus berkas tersimpan.
create or replace function public.portal_batalkan_sesi(p_sesi uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.portal_sesi_unggahan where id=p_sesi for update;
  update public.portal_sesi_unggahan set status='dibatalkan' where id=p_sesi and status<>'tersimpan';
  return found;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and left(p.proname,7)='portal_' loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
