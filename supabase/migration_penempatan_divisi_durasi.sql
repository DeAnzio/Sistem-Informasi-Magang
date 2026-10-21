begin;

alter table public.applicants
  alter column divisi_id drop not null;

alter table public.applicants
  drop constraint if exists applicants_durasi_minimum_check;

create or replace function public.enforce_applicant_minimum_duration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tanggal_selesai < (new.tanggal_mulai + interval '1 month')::date then
    raise exception 'Durasi magang minimal satu bulan.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists applicants_minimum_duration_guard on public.applicants;
create trigger applicants_minimum_duration_guard
before insert or update of tanggal_mulai, tanggal_selesai on public.applicants
for each row execute function public.enforce_applicant_minimum_duration();

create or replace function public.terima_pendaftar(p_id uuid, p_admin uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_divisi uuid; v_mulai date; v_selesai date; v_sisa int;
begin
  select divisi_id, tanggal_mulai, tanggal_selesai
    into v_divisi, v_mulai, v_selesai
    from public.applicants where id = p_id and status = 'pending' for update;
  if not found then return 'sudah_diproses'; end if;
  if v_divisi is null then return 'divisi_belum_dipilih'; end if;
  if v_selesai < (v_mulai + interval '1 month')::date then return 'tanggal_tidak_valid'; end if;

  perform 1 from public.divisi where id = v_divisi for update;
  v_sisa := public.sisa_kuota_rentang(v_divisi, v_mulai, v_selesai);
  if v_sisa is null then return 'divisi_tidak_tersedia'; end if;
  if v_sisa <= 0 then return 'kuota_penuh'; end if;

  update public.applicants
     set status = 'diterima', verified_by = p_admin, verified_at = now()
   where id = p_id;
  return 'ok';
end $$;

revoke execute on function public.terima_pendaftar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.terima_pendaftar(uuid, uuid) to service_role;

commit;
