begin;

drop view if exists public.slot_info;
drop function if exists public.terima_pendaftar(uuid, uuid);
drop function if exists public.tolak_pendaftar(uuid, uuid, text);

alter table public.divisi add column kuota int not null default 5 check (kuota >= 0);
update public.divisi set kuota = kuota_default;

alter table public.applicants
  add column divisi_id uuid,
  add column tanggal_mulai date,
  add column tanggal_selesai date;

update public.applicants a
set divisi_id = d.id,
    tanggal_mulai = p.mulai,
    tanggal_selesai = p.selesai
from public.slots s
join public.divisi d on d.id = s.divisi_id
join public.periode p on p.id = s.periode_id
where a.slot_id = s.id;

do $$
begin
  if exists (
    select 1 from public.applicants
    where divisi_id is null or tanggal_mulai is null or tanggal_selesai is null
  ) then
    raise exception 'Migrasi terhenti: terdapat pendaftar yang tidak bisa dipetakan ke divisi/periode.';
  end if;
end $$;

alter table public.applicants
  alter column divisi_id set not null,
  alter column tanggal_mulai set not null,
  alter column tanggal_selesai set not null,
  add constraint applicants_divisi_id_fkey foreign key (divisi_id) references public.divisi(id),
  add constraint applicants_tanggal_order_check check (tanggal_selesai > tanggal_mulai),
  add constraint applicants_durasi_check check (tanggal_selesai - tanggal_mulai <= 366);

alter table public.applicants drop constraint if exists applicants_slot_id_fkey;
alter table public.applicants drop constraint if exists applicants_nim_slot_id_key;
alter table public.applicants
  add constraint applicants_nim_divisi_mulai_key unique (nim, divisi_id, tanggal_mulai);
alter table public.applicants drop column slot_id;

drop function if exists public.buat_periode(text, date, date);
drop table public.slots cascade;
drop table public.periode cascade;

alter table public.divisi drop column kuota_default;
drop index if exists public.applicants_slot_id_idx;
drop index if exists public.applicants_divisi_dates_idx;
create index applicants_divisi_dates_idx on public.applicants (divisi_id, status, tanggal_mulai, tanggal_selesai);

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
         c.aktif_sekarang::int, c.akan_datang::int,
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
  select divisi_id, tanggal_mulai, tanggal_selesai into v_divisi, v_mulai, v_selesai
  from public.applicants where id = p_id and status = 'pending' for update;
  if v_divisi is null then return 'sudah_diproses'; end if;
  perform 1 from public.divisi where id = v_divisi for update;
  if public.sisa_kuota_rentang(v_divisi, v_mulai, v_selesai) <= 0 then return 'kuota_penuh'; end if;
  update public.applicants set status = 'diterima', verified_by = p_admin, verified_at = now() where id = p_id;
  return 'ok';
end $$;

create or replace function public.tolak_pendaftar(p_id uuid, p_admin uuid, p_catatan text)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.applicants
  set status = 'ditolak', catatan_admin = p_catatan, verified_by = p_admin, verified_at = now()
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
      select (select count(*) from public.applicants a where a.divisi_id = p_divisi
        and a.status = 'diterima' and (public.hari_ini() + i) between a.tanggal_mulai and a.tanggal_selesai) as cnt
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

commit;
