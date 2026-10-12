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

create type public.status_pendaftar as enum ('pending', 'diterima', 'ditolak');

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  email text not null,
  no_hp text not null,
  asal_kampus text not null,
  jurusan text not null,
  nim text not null,
  divisi_id uuid not null references public.divisi(id),
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
  check (tanggal_selesai > tanggal_mulai),
  check (tanggal_selesai - tanggal_mulai <= 366),
  unique (nim, divisi_id, tanggal_mulai)
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  tipe text not null check (tipe in ('diterima', 'ditolak')),
  status_kirim text not null check (status_kirim in ('terkirim', 'gagal')),
  error_pesan text,
  sent_at timestamptz not null default now()
);

create index applicants_status_created_at_idx on public.applicants (status, created_at desc);
create index applicants_divisi_dates_idx on public.applicants (divisi_id, status, tanggal_mulai, tanggal_selesai);

alter table public.divisi enable row level security;
alter table public.admins enable row level security;
alter table public.applicants enable row level security;
alter table public.email_logs enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create policy "divisi_read_all" on public.divisi for select using (true);
create policy "divisi_admin_write" on public.divisi for all
  using (public.is_admin()) with check (public.is_admin());
create policy "applicants_admin_all" on public.applicants for all
  using (public.is_admin()) with check (public.is_admin());
create policy "email_logs_admin_all" on public.email_logs for all
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

create or replace function public.terima_pendaftar(p_id uuid, p_admin uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_divisi uuid; v_mulai date; v_selesai date;
begin
  select divisi_id, tanggal_mulai, tanggal_selesai
    into v_divisi, v_mulai, v_selesai
    from public.applicants where id = p_id and status = 'pending' for update;
  if v_divisi is null then return 'sudah_diproses'; end if;

  perform 1 from public.divisi where id = v_divisi for update;
  if public.sisa_kuota_rentang(v_divisi, v_mulai, v_selesai) <= 0 then
    return 'kuota_penuh';
  end if;

  update public.applicants
     set status = 'diterima', verified_by = p_admin, verified_at = now()
   where id = p_id;
  return 'ok';
end $$;

create or replace function public.tolak_pendaftar(p_id uuid, p_admin uuid, p_catatan text)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.applicants
     set status = 'ditolak', catatan_admin = p_catatan,
         verified_by = p_admin, verified_at = now()
   where id = p_id and status = 'pending';
  if not found then return 'sudah_diproses'; end if;
  return 'ok';
end $$;

create or replace function public.ubah_kuota_divisi(p_divisi uuid, p_kuota int)
returns text language plpgsql security definer set search_path = public as $$
declare v_last date; v_max int;
begin
  if p_kuota < 0 then return 'kuota_tidak_valid'; end if;
  perform 1 from public.divisi where id = p_divisi for update;
  if not found then return 'divisi_tidak_ditemukan'; end if;

  select max(tanggal_selesai) into v_last from public.applicants
   where divisi_id = p_divisi and status = 'diterima' and tanggal_selesai >= public.hari_ini();

  if v_last is not null then
    select coalesce(max(h.cnt), 0) into v_max from (
      select (select count(*) from public.applicants a
               where a.divisi_id = p_divisi and a.status = 'diterima'
                 and (public.hari_ini() + i) between a.tanggal_mulai and a.tanggal_selesai) as cnt
      from generate_series(0, v_last - public.hari_ini()) as i
    ) h;
    if p_kuota < v_max then return 'kuota_kurang_dari_terisi'; end if;
  end if;

  update public.divisi set kuota = p_kuota where id = p_divisi;
  return 'ok';
end $$;

revoke execute on function public.terima_pendaftar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.tolak_pendaftar(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.sisa_kuota_rentang(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.ubah_kuota_divisi(uuid, int) from public, anon, authenticated;
grant execute on function public.get_slot_info() to anon, authenticated;
grant execute on function public.terima_pendaftar(uuid, uuid) to service_role;
grant execute on function public.tolak_pendaftar(uuid, uuid, text) to service_role;
grant execute on function public.sisa_kuota_rentang(uuid, date, date) to service_role;
grant execute on function public.ubah_kuota_divisi(uuid, int) to service_role;

grant usage on schema public to anon, authenticated;
grant select on public.divisi to anon, authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.divisi to authenticated;
grant select, insert, update, delete on public.applicants, public.email_logs to authenticated;
