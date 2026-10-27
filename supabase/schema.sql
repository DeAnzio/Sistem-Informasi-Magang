create extension if not exists pgcrypto;

create table public.divisi (
  id uuid primary key default gen_random_uuid(),
  urutan int not null unique,
  nama text not null unique,
  kuota int not null default 5 check (kuota >= 0),
  aktif boolean not null default true
);

insert into public.divisi (urutan, nama, kuota) values
  (1, 'Divisi-1', 5),
  (2, 'Divisi-2', 5),
  (3, 'Divisi-3', 5),
  (4, 'Divisi-4', 5),
  (5, 'Divisi-5', 5);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nama text not null
);

create type public.status_pendaftar as enum ('pending', 'diterima', 'ditolak', 'dibatalkan');

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  email text not null,
  no_hp text not null,
  asal_kampus text not null,
  jurusan text not null,
  nim text not null,
  divisi_id uuid references public.divisi(id),
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  berkas_cv text,
  berkas_surat_pengantar text,
  status public.status_pendaftar not null default 'pending',
  catatan_admin text,
  sumber text not null default 'online' check (sumber in ('online', 'manual')),
  verified_by uuid references public.admins(user_id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (tanggal_selesai >= (tanggal_mulai + interval '1 month')::date),
  check (tanggal_selesai - tanggal_mulai <= 366),
  unique (nim, divisi_id, tanggal_mulai)
);

create index applicants_status_created_at_idx on public.applicants (status, created_at desc);
create index applicants_divisi_dates_idx on public.applicants (divisi_id, status, tanggal_mulai, tanggal_selesai);

alter table public.divisi enable row level security;
alter table public.admins enable row level security;
alter table public.applicants enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create policy "divisi_read_all" on public.divisi for select using (true);
create policy "divisi_admin_write" on public.divisi for all
  using (public.is_admin()) with check (public.is_admin());
create policy "applicants_admin_all" on public.applicants for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admins_self_read" on public.admins for select
  using (user_id = auth.uid());

create or replace function public.hari_ini() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

create or replace function public.sisa_kuota_rentang(p_divisi uuid, p_mulai date, p_selesai date)
returns int language sql stable security definer set search_path = public as $$
  select d.kuota - coalesce((
    select max(h.cnt) from (
      select (select count(*) from public.applicants a
               where a.divisi_id = d.id and a.status = 'diterima'
                 and (p_mulai + i) between a.tanggal_mulai and a.tanggal_selesai) as cnt
      from generate_series(0, p_selesai - p_mulai) as i
    ) h
  ), 0)
  from public.divisi d where d.id = p_divisi and d.aktif;
$$;

create or replace function public.get_slot_info()
returns table (
  divisi_id uuid, divisi_nama text, urutan int,
  kuota int, terisi int, terjadwal int, sisa int, status text
)
language sql stable security definer set search_path = public as $$
  select d.id, d.nama, d.urutan, d.kuota,
         c.aktif_sekarang::int,
         c.akan_datang::int,
         greatest(d.kuota - c.aktif_sekarang, 0)::int,
         case when d.kuota - c.aktif_sekarang > 0 then 'tersedia' else 'penuh' end
  from public.divisi d
  cross join lateral (
    select
      count(*) filter (where public.hari_ini() between a.tanggal_mulai and a.tanggal_selesai) as aktif_sekarang,
      count(*) filter (where a.tanggal_mulai > public.hari_ini()) as akan_datang
    from public.applicants a
    where a.divisi_id = d.id and a.status = 'diterima' and a.tanggal_selesai >= public.hari_ini()
  ) c
  where d.aktif
  order by d.urutan;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.divisi to anon, authenticated;
grant select on public.admins, public.applicants to authenticated;
grant all on public.divisi, public.admins, public.applicants to service_role;

-- Fondasi aplikasi: jaga bagian ini selaras dengan migration_fondasi.sql.
-- Database lama: jalankan migration_fondasi_enum.sql terlebih dahulu.
-- Tidak menghapus/menggabungkan pendaftaran lama secara otomatis.
begin;

alter table public.applicants add column if not exists dibatalkan_at timestamptz;
alter table public.applicants add column if not exists catatan_batal text;
alter table public.applicants add column if not exists sumber text not null default 'online';
-- Pendaftaran online belum mempunyai divisi sampai admin menetapkan penempatan.
alter table public.applicants alter column divisi_id drop not null;
-- Jangan mengarang waktu pendaftaran lama bila ada tanggal yang kosong.
do $$ begin
  if exists(select 1 from public.applicants where created_at is null) then
    raise exception 'Ada created_at kosong. Tinjau waktu pendaftaran lama sebelum menjalankan migrasi fondasi.';
  end if;
end $$;
alter table public.applicants alter column created_at set default now();
alter table public.applicants alter column created_at set not null;

do $$ begin
  if exists (select 1 from public.applicants where divisi_id is null
    group by nim, tanggal_mulai having count(*) > 1) then
    raise exception 'Duplikat pendaftaran tanpa divisi ditemukan. Tinjau dengan query pada panduan migrasi sebelum melanjutkan.';
  end if;
end $$;
create unique index if not exists applicants_unassigned_unique
  on public.applicants(nim, tanggal_mulai) where divisi_id is null;

create table if not exists public.aktivitas_pendaftar (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  aksi text not null check (aksi in ('input_manual','terima','tolak','batalkan','ubah_jadwal','ubah_divisi','unduh_berkas')),
  detail jsonb,
  oleh uuid references public.admins(user_id),
  waktu timestamptz not null default clock_timestamp()
);
create index if not exists aktivitas_applicant_waktu_idx on public.aktivitas_pendaftar(applicant_id, waktu desc, id);
alter table public.aktivitas_pendaftar enable row level security;
drop policy if exists aktivitas_admin_read on public.aktivitas_pendaftar;
create policy aktivitas_admin_read on public.aktivitas_pendaftar for select using (public.is_admin());

create table if not exists public.aktivitas_kuota (
  id uuid primary key default gen_random_uuid(),
  divisi_id uuid not null references public.divisi(id),
  sebelum int not null,
  sesudah int not null,
  oleh uuid not null references public.admins(user_id),
  waktu timestamptz not null default clock_timestamp()
);
alter table public.aktivitas_kuota enable row level security;
drop policy if exists kuota_admin_read on public.aktivitas_kuota;
create policy kuota_admin_read on public.aktivitas_kuota for select using (public.is_admin());

-- Hanya server yang dapat mengelola sesi. Baris dikunci saat simpan/cleanup.
create table if not exists public.sesi_unggahan (
  id uuid primary key,
  admin_id uuid references public.admins(user_id),
  sumber text not null check (sumber in ('online','manual')),
  applicant jsonb not null,
  files jsonb not null,
  status_awal text not null default 'pending' check (status_awal in ('pending','diterima')),
  status text not null default 'siap' check (status in ('siap','tersimpan','dibatalkan')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((sumber = 'online' and admin_id is null) or (sumber = 'manual' and admin_id is not null))
);
alter table public.sesi_unggahan enable row level security;
create index if not exists sesi_unggahan_cleanup_idx on public.sesi_unggahan(status, created_at);

-- Sweep event: menghitung okupansi maksimum tanpa membuat satu baris per hari.
create or replace function public.okupansi_maksimum(p_divisi uuid, p_mulai date, p_selesai date, p_kecuali uuid default null)
returns int language sql volatile set search_path = public as $$
  with events as (
    select greatest(tanggal_mulai, p_mulai) as hari, 1 as perubahan from public.applicants
      where divisi_id = p_divisi and status = 'diterima' and id is distinct from p_kecuali
      and tanggal_mulai <= p_selesai and tanggal_selesai >= p_mulai
    union all
    select least(tanggal_selesai, p_selesai) + 1, -1 from public.applicants
      where divisi_id = p_divisi and status = 'diterima' and id is distinct from p_kecuali
      and tanggal_mulai <= p_selesai and tanggal_selesai >= p_mulai
  ), totals as (select hari, sum(perubahan) as perubahan from events group by hari),
  running as (select sum(perubahan) over (order by hari) as jumlah from totals)
  select coalesce(max(jumlah), 0)::int from running;
$$;

create or replace function public.sisa_kuota_rentang(p_divisi uuid, p_mulai date, p_selesai date)
returns int language sql volatile security definer set search_path = public as $$
  select kuota - public.okupansi_maksimum(id, p_mulai, p_selesai)
  from public.divisi where id = p_divisi and aktif;
$$;

-- Guard berlaku juga bagi penulisan service-role di luar RPC.
create or replace function public.jaga_integritas_pendaftar()
returns trigger language plpgsql set search_path = public as $$
declare v_kuota int; v_aktif boolean;
begin
  if new.tanggal_selesai < (new.tanggal_mulai + interval '1 month')::date
    or new.tanggal_selesai - new.tanggal_mulai > 366 then
    raise exception 'tanggal_tidak_valid' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('diterima','ditolak')) or
    (old.status = 'diterima' and new.status = 'dibatalkan')
  ) then raise exception 'status_tidak_valid' using errcode = '23514'; end if;
  if new.status = 'diterima' then
    if new.divisi_id is null then raise exception 'divisi_belum_dipilih' using errcode = '23514'; end if;
    select kuota, aktif into v_kuota, v_aktif from public.divisi where id = new.divisi_id for update;
    if not coalesce(v_aktif, false) then raise exception 'divisi_tidak_tersedia' using errcode = '23514'; end if;
    if public.okupansi_maksimum(new.divisi_id, new.tanggal_mulai, new.tanggal_selesai, new.id) >= v_kuota then
      raise exception 'kuota_penuh' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists applicants_integrity_guard on public.applicants;
create trigger applicants_integrity_guard before insert or update on public.applicants
  for each row execute function public.jaga_integritas_pendaftar();

create or replace function public.jaga_kuota_divisi()
returns trigger language plpgsql set search_path = public as $$
declare v_last date;
begin
  select max(tanggal_selesai) into v_last from public.applicants
    where divisi_id = new.id and status = 'diterima' and tanggal_selesai >= public.hari_ini();
  if new.kuota < 0 or new.kuota > 500 then raise exception 'kuota_tidak_valid' using errcode = '23514'; end if;
  if v_last is not null and new.kuota < public.okupansi_maksimum(new.id, public.hari_ini(), v_last) then
    raise exception 'kuota_kurang_dari_terisi' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists divisi_quota_guard on public.divisi;
create trigger divisi_quota_guard before update of kuota on public.divisi
  for each row execute function public.jaga_kuota_divisi();

create or replace function public.terima_pendaftar(p_id uuid, p_admin uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a public.applicants;
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  select * into a from public.applicants where id = p_id for update;
  if not found then return 'tidak_ditemukan'; end if;
  if a.status <> 'pending' then return 'sudah_diproses'; end if;
  update public.applicants set status = 'diterima', verified_by = p_admin, verified_at = now() where id = p_id;
  insert into public.aktivitas_pendaftar(applicant_id, aksi, oleh) values(p_id, 'terima', p_admin);
  return 'ok';
exception when check_violation then return sqlerrm;
end $$;

create or replace function public.tolak_pendaftar(p_id uuid, p_admin uuid, p_catatan text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  update public.applicants set status = 'ditolak', catatan_admin = left(p_catatan,500),
    verified_by = p_admin, verified_at = now() where id = p_id and status = 'pending';
  if not found then return 'sudah_diproses'; end if;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh)
    values(p_id,'tolak',jsonb_build_object('catatan',left(p_catatan,500)),p_admin);
  return 'ok';
end $$;

create or replace function public.batalkan_pendaftar(p_id uuid, p_admin uuid, p_catatan text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  if length(trim(p_catatan)) < 3 then return 'catatan_tidak_valid'; end if;
  update public.applicants set status = 'dibatalkan', catatan_batal = left(trim(p_catatan),500),
    dibatalkan_at = now() where id = p_id and status = 'diterima';
  if not found then return 'status_tidak_valid'; end if;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh)
    values(p_id,'batalkan',jsonb_build_object('catatan',left(trim(p_catatan),500)),p_admin);
  return 'ok';
end $$;

create or replace function public.ubah_jadwal_pemagang(p_id uuid, p_admin uuid, p_mulai date, p_selesai date)
returns text language plpgsql security definer set search_path = public as $$
declare a public.applicants;
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  select * into a from public.applicants where id = p_id for update;
  if not found then return 'tidak_ditemukan'; end if;
  if a.status not in ('pending','diterima') then return 'status_tidak_valid'; end if;
  update public.applicants set tanggal_mulai = p_mulai, tanggal_selesai = p_selesai where id = p_id;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh) values(p_id,'ubah_jadwal',
    jsonb_build_object('dari',jsonb_build_object('mulai',a.tanggal_mulai,'selesai',a.tanggal_selesai),
    'ke',jsonb_build_object('mulai',p_mulai,'selesai',p_selesai)),p_admin);
  return 'ok';
exception when unique_violation then return 'jadwal_duplikat';
  when check_violation then return sqlerrm;
end $$;

create or replace function public.ubah_divisi_pendaftar(p_id uuid, p_admin uuid, p_divisi uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a public.applicants;
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  select * into a from public.applicants where id = p_id for update;
  if not found then return 'tidak_ditemukan'; end if;
  if a.status <> 'pending' then return 'status_tidak_valid'; end if;
  perform 1 from public.divisi where id = p_divisi and aktif for update;
  if not found then return 'divisi_tidak_tersedia'; end if;
  update public.applicants set divisi_id = p_divisi where id = p_id;
  insert into public.aktivitas_pendaftar(applicant_id,aksi,detail,oleh)
    values(p_id,'ubah_divisi',jsonb_build_object('dari',a.divisi_id,'ke',p_divisi),p_admin);
  return 'ok';
exception when unique_violation then return 'jadwal_duplikat';
end $$;

-- Hapus signature lama agar aktor wajib diberikan pada perubahan kuota.
drop function if exists public.ubah_kuota_divisi(uuid,int);
create or replace function public.ubah_kuota_divisi(p_divisi uuid, p_kuota int, p_admin uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
  if not exists(select 1 from public.admins where user_id = p_admin) then raise exception 'admin_tidak_valid'; end if;
  select kuota into v_old from public.divisi where id = p_divisi for update;
  if not found then return 'divisi_tidak_ditemukan'; end if;
  update public.divisi set kuota = p_kuota where id = p_divisi;
  insert into public.aktivitas_kuota(divisi_id,sebelum,sesudah,oleh) values(p_divisi,v_old,p_kuota,p_admin);
  return 'ok';
exception when check_violation then return sqlerrm;
end $$;

create or replace function public.simpan_pendaftaran(p_id uuid, p_admin uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.sesi_unggahan; a public.applicants; f record; v_path text; v_mime text; v_result text; v_notice text;
begin
  select * into s from public.sesi_unggahan where id = p_id for update;
  if not found then return jsonb_build_object('error','tiket_tidak_valid'); end if;
  if s.admin_id is distinct from p_admin then return jsonb_build_object('error','tiket_tidak_valid'); end if;
  if s.status = 'tersimpan' then
    select * into a from public.applicants where id = p_id;
    return jsonb_build_object('id',a.id,'status',a.status,'alreadySaved',true);
  end if;
  if s.status <> 'siap' or s.expires_at < now() then return jsonb_build_object('error','tiket_tidak_valid'); end if;
  if s.sumber = 'online' and (s.files->>'berkas_cv' is null or s.files->>'berkas_surat_pengantar' is null) then
    return jsonb_build_object('error','berkas_tidak_valid');
  end if;
  for f in select * from jsonb_each_text(s.files) loop
    v_path := f.value;
    if v_path is null then continue; end if;
    if split_part(v_path,'/',1) <> p_id::text then return jsonb_build_object('error','berkas_tidak_valid'); end if;
    v_mime := case when v_path like '%.pdf' then 'application/pdf' when v_path like '%.jpg' then 'image/jpeg' when v_path like '%.png' then 'image/png' end;
    if not exists(select 1 from storage.objects where bucket_id = 'berkas' and name = v_path
      and metadata->>'mimetype' = v_mime and (metadata->>'size')::bigint between 1 and 5242880) then
      return jsonb_build_object('error','berkas_tidak_valid');
    end if;
  end loop;
  insert into public.applicants(id,nama,email,no_hp,asal_kampus,jurusan,nim,divisi_id,tanggal_mulai,tanggal_selesai,
    berkas_cv,berkas_surat_pengantar,sumber) values(p_id,s.applicant->>'nama',s.applicant->>'email',s.applicant->>'no_hp',
    s.applicant->>'asal_kampus',s.applicant->>'jurusan',s.applicant->>'nim',(s.applicant->>'divisi_id')::uuid,
    (s.applicant->>'tanggal_mulai')::date,(s.applicant->>'tanggal_selesai')::date,
    s.files->>'berkas_cv',s.files->>'berkas_surat_pengantar',s.sumber);
  if s.sumber = 'manual' then
    insert into public.aktivitas_pendaftar(applicant_id,aksi,oleh) values(p_id,'input_manual',p_admin);
    if s.status_awal = 'diterima' then
      v_result := public.terima_pendaftar(p_id,p_admin);
      if v_result <> 'ok' then
        v_notice := case when v_result = 'kuota_penuh' then 'kuota_penuh' else 'terima_gagal' end;
      end if;
    end if;
  end if;
  update public.sesi_unggahan set status = 'tersimpan' where id = p_id;
  select * into a from public.applicants where id = p_id;
  return jsonb_build_object('id',p_id,'status',a.status,'alreadySaved',false,'notice',v_notice);
exception when unique_violation then return jsonb_build_object('error','pendaftaran_duplikat');
end $$;

create or replace function public.batalkan_unggahan(p_id uuid, p_admin uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.sesi_unggahan;
begin
  select * into s from public.sesi_unggahan where id = p_id for update;
  if not found or s.admin_id is distinct from p_admin then return false; end if;
  if s.status = 'tersimpan' or exists(select 1 from public.applicants where id = p_id) then return false; end if;
  update public.sesi_unggahan set status = 'dibatalkan' where id = p_id;
  return true;
end $$;

-- Riwayat pengiriman lama tetap disimpan sebagai arsip bila tabel tersedia.
do $$ begin
  if to_regclass('public.email_logs') is not null then
    execute 'revoke all privileges on public.email_logs from public,authenticated,anon';
  end if;
end $$;

-- Browser admin hanya membaca; seluruh mutasi bisnis melewati API server.
-- REVOKE ALL juga mencabut TRUNCATE/REFERENCES/TRIGGER dari default grant lama.
-- RLS tidak melindungi TRUNCATE sehingga pencabutan DML saja tidak cukup.
revoke all privileges on public.admins,public.applicants,public.divisi,
  public.aktivitas_pendaftar,public.aktivitas_kuota,public.sesi_unggahan from public,authenticated,anon;
grant select on public.divisi to anon,authenticated;
grant select on public.admins,public.applicants,public.aktivitas_pendaftar,public.aktivitas_kuota to authenticated;
grant all on public.admins,public.applicants,public.divisi,
  public.aktivitas_pendaftar,public.aktivitas_kuota,public.sesi_unggahan to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('okupansi_maksimum','sisa_kuota_rentang','terima_pendaftar',
      'tolak_pendaftar','batalkan_pendaftar','ubah_jadwal_pemagang','ubah_divisi_pendaftar','ubah_kuota_divisi',
      'simpan_pendaftaran','batalkan_unggahan','jaga_integritas_pendaftar','jaga_kuota_divisi') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
commit;
