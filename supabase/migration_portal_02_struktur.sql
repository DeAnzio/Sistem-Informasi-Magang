-- DRAF UNTUK STAGING. Jalankan sesudah 01 selesai/committed.
-- Lihat MIGRATION_PORTAL.md. Tidak menghapus pendaftar, akun, atau berkas lama.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.applicants in access exclusive mode;

do $$ begin
  if not exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='status_pendaftar' and e.enumlabel='selesai') then
    raise exception 'Jalankan migration_portal_01_enum.sql dan commit terlebih dahulu';
  end if;
  if exists(select 1 from public.applicants where status in ('pending','perbaikan','diperiksa','diterima','tunggu')
    group by lower(btrim(email)) having count(*)>1) then
    raise exception 'Email aktif duplikat: tinjau data sebelum migrasi';
  end if;
  if exists(select 1 from public.applicants where email is null or btrim(email)=''
    or no_hp is null or regexp_replace(no_hp,'[[:space:]-]','','g') !~ '^08[0-9]{8,11}$'
    or tanggal_mulai is null or tanggal_selesai is null
    or tanggal_selesai < (tanggal_mulai + interval '1 month')::date
    or tanggal_selesai-tanggal_mulai>366) then
    raise exception 'Data email/telepon/tanggal belum sesuai: migrasi dibatalkan tanpa menghapus data';
  end if;
end $$;

-- Jangan menormalkan baris lama otomatis: fungsi indeks menyamakan email,
-- sedangkan trigger file 03 menormalkan input baru/perubahan identitas.
alter table public.applicants alter column nim drop not null;
alter table public.applicants drop constraint if exists applicants_unik;
alter table public.applicants drop constraint if exists applicants_nim_divisi_id_tanggal_mulai_key;
drop index if exists public.applicants_unassigned_unique;
create unique index if not exists applicants_email_aktif_unique on public.applicants(lower(btrim(email)))
  where status in ('pending','perbaikan','diperiksa','diterima','tunggu');

alter table public.applicants add column if not exists pesan_pendaftar text not null default '';
alter table public.applicants add column if not exists pemeriksaan jsonb not null
  default '{"identity":false,"cv":false,"surat":false,"schedule":false}';
alter table public.applicants add column if not exists catatan_perbaikan jsonb not null default '{}';
alter table public.applicants add column if not exists perbaikan_diminta_at timestamptz;
alter table public.applicants add column if not exists daftar_tunggu_at timestamptz;
alter table public.applicants drop constraint if exists portal_email_nonempty;
alter table public.applicants add constraint portal_email_nonempty check (btrim(email)<>'');
alter table public.applicants drop constraint if exists portal_telepon;
alter table public.applicants add constraint portal_telepon
  check (regexp_replace(no_hp,'[[:space:]-]','','g') ~ '^08[0-9]{8,11}$');
alter table public.applicants drop constraint if exists portal_durasi;
alter table public.applicants add constraint portal_durasi check (
  tanggal_selesai >= (tanggal_mulai + interval '1 month')::date and tanggal_selesai-tanggal_mulai<=366);
alter table public.applicants drop constraint if exists portal_pesan_length;
alter table public.applicants add constraint portal_pesan_length check(length(pesan_pendaftar)<=1000);
alter table public.applicants drop constraint if exists portal_pemeriksaan;
alter table public.applicants add constraint portal_pemeriksaan check (
  jsonb_typeof(pemeriksaan)='object' and pemeriksaan ?& array['identity','cv','surat','schedule']
  and jsonb_typeof(pemeriksaan->'identity')='boolean' and jsonb_typeof(pemeriksaan->'cv')='boolean'
  and jsonb_typeof(pemeriksaan->'surat')='boolean' and jsonb_typeof(pemeriksaan->'schedule')='boolean');

-- Kode mentah tidak disimpan atau dibuka lewat SELECT browser admin.
-- Server harus menghasilkan kode acak kuat dan menyimpan SHA-256 hex di sini.
create table if not exists public.akses_pelacakan (
  applicant_id uuid primary key references public.applicants(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Berkas lama tetap pada applicants; tidak mengarang ukuran/MIME/versinya.
-- Tabel ini dipakai untuk unggahan baru yang sudah diverifikasi server.
create table if not exists public.dokumen_pendaftar (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  jenis text not null check(jenis in ('cv','surat','laporan')),
  versi int not null check(versi>0),
  storage_path text not null unique,
  nama_asli text not null check(length(nama_asli) between 1 and 255),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  ukuran bigint not null check(ukuran between 1 and 5242880),
  created_at timestamptz not null default clock_timestamp(),
  unique(applicant_id,jenis,versi),
  unique(id,applicant_id),
  check(jenis<>'laporan' or mime_type='application/pdf'),
  check(split_part(storage_path,'/',1)=applicant_id::text)
);
create table if not exists public.penyelesaian_magang (
  applicant_id uuid primary key references public.applicants(id) on delete cascade,
  dokumen_id uuid not null,
  status text not null default 'submitted' check(status in ('submitted','revision','approved')),
  pesan text not null default '' check(length(pesan)<=1000),
  submitted_at timestamptz not null default clock_timestamp(),
  approved_at timestamptz,
  diperiksa_oleh uuid references public.admins(user_id),
  foreign key(dokumen_id,applicant_id) references public.dokumen_pendaftar(id,applicant_id),
  check(status<>'approved' or (approved_at is not null and diperiksa_oleh is not null))
);
create table if not exists public.survei_magang (
  applicant_id uuid primary key references public.applicants(id) on delete cascade,
  informasi smallint not null check(informasi between 1 and 5),
  pendaftaran smallint not null check(pendaftaran between 1 and 5),
  pelayanan smallint not null check(pelayanan between 1 and 5),
  pengalaman smallint not null check(pengalaman between 1 and 5),
  komentar text not null default '' check(length(komentar)<=1000),
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.pengaturan_layanan (
  id boolean primary key default true check(id),
  pendaftaran_dibuka boolean not null default false,
  batas_pendaftaran date,
  pengumuman text not null default '' check(length(pengumuman)<=1000),
  kontak text not null default '' check(length(kontak)<=500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admins(user_id)
);
-- Tertutup sampai konfigurasi dan integrasi diuji. Bukan salinan pengaturan lokal.
insert into public.pengaturan_layanan(id) values(true) on conflict(id) do nothing;

-- Audit fondasi baru pernah mempunyai CHECK daftar aksi lama.
alter table public.aktivitas_pendaftar drop constraint if exists aktivitas_pendaftar_aksi_check;
-- Catatan internal tetap terpisah dari pesan yang aman ditampilkan ke pendaftar.

do $$ declare t text; begin
  foreach t in array array['akses_pelacakan','dokumen_pendaftar','penyelesaian_magang','survei_magang','pengaturan_layanan'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t<>'akses_pelacakan' then
      execute format('drop policy if exists portal_admin_read on public.%I',t);
      execute format('create policy portal_admin_read on public.%I for select to authenticated using(public.is_admin())',t);
      execute format('grant select on public.%I to authenticated',t);
    end if;
  end loop;
end $$;
commit;
