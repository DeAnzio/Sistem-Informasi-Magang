import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// PostgreSQL lokal dalam memori; auth dan storage adalah stub skema Supabase.
// Ini menguji SQL sebenarnya, bukan mock RPC. Uji multi-koneksi tetap perlu di staging.
const notices = [];
const db = new PGlite();
const admin = randomUUID();
let division;
const setup = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create schema storage; create table storage.objects(bucket_id text, name text, metadata jsonb);
`;
const sqlFile = async (name) => (await readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const withoutExtension = (sql) => sql.replace("create extension if not exists pgcrypto;", "");
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const data = (nim, divisi = null) => ({ nama: "Peserta", email: "test@example.com", no_hp: "08123456789", asal_kampus: "Kampus", jurusan: "Informatika", nim, divisi_id: divisi, tanggal_mulai: "2030-01-01", tanggal_selesai: "2030-02-01" });
async function session(nim, { manual = false, files = true, divisi = null, statusAwal = "pending" } = {}) {
  const id = randomUUID();
  const paths = { berkas_cv: files ? `${id}/cv.pdf` : null, berkas_surat_pengantar: files ? `${id}/surat-pengantar.pdf` : null };
  if (files) for (const path of Object.values(paths)) await db.query("insert into storage.objects values ('berkas',$1,$2)", [path, { size: 100, mimetype: "application/pdf" }]);
  await db.query("insert into sesi_unggahan(id,admin_id,sumber,applicant,files,status_awal,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '15 minutes')",
    [id, manual ? admin : null, manual ? "manual" : "online", data(nim, divisi), paths, statusAwal]);
  return id;
}
const save = (id, actor = null) => scalar("select simpan_pendaftaran($1,$2)", [id, actor]);

before(async () => {
  await db.exec(setup);
  await db.exec(withoutExtension(await sqlFile("schema.sql")));
  await db.query("insert into auth.users values ($1)", [admin]);
  await db.query("insert into admins values ($1,'Admin Uji')", [admin]);
  division = await scalar("select id from divisi order by urutan limit 1");
  await db.query("update divisi set kuota=1 where id=$1", [division]);
});
after(() => db.close());

test("skema baru tidak membuat tabel pengiriman email", async () => {
  assert.equal(await scalar("select to_regclass('public.email_logs')::text"), null);
});

test("finalisasi idempoten, cleanup tidak menghapus sesi tersimpan", async () => {
  const id = await session("1001", { files: true });
  const first = await save(id);
  assert.equal(first.id, id);
  assert.equal(first.alreadySaved, false);
  const retries = await Promise.all([save(id), save(id)]);
  assert.ok(retries.every((row) => row.id === id && row.alreadySaved));
  assert.equal(await scalar("select batalkan_unggahan($1,null)", [id]), false);
  assert.equal(await scalar("select count(*)::int from storage.objects where name like $1", [`${id}/%`]), 2);
});

test("cleanup menang sebelum simpan, metadata berkas dan kedaluwarsa diperiksa", async () => {
  const id = await session("1002", { files: true });
  assert.equal(await scalar("select batalkan_unggahan($1,null)", [id]), true);
  assert.equal((await save(id)).error, "tiket_tidak_valid");
  const expired = await session("1003");
  await db.query("update sesi_unggahan set expires_at=now()-interval '1 minute' where id=$1", [expired]);
  assert.equal((await save(expired)).error, "tiket_tidak_valid");
  const bad = await session("1004", { files: true });
  await db.query("update storage.objects set metadata=$1 where name like $2", [{ size: 100, mimetype: "text/html" }, `${bad}/%`]);
  assert.equal((await save(bad)).error, "berkas_tidak_valid");
});

test("duplikat tanpa divisi ditolak database", async () => {
  const a = await session("2001"); const b = await session("2001");
  assert.ok((await save(a)).id);
  assert.equal((await save(b)).error, "pendaftaran_duplikat");
});

test("penempatan, penerimaan, kuota, perubahan jadwal, pembatalan dan audit", async () => {
  const a = await session("3001", { manual: true, divisi: division });
  assert.equal((await save(a, randomUUID())).error, "tiket_tidak_valid");
  assert.ok((await save(a, admin)).id);
  assert.equal(await scalar("select terima_pendaftar($1,$2)", [a, admin]), "ok");
  const b = await session("3002", { manual: true, divisi: division });
  await save(b, admin);
  assert.equal(await scalar("select terima_pendaftar($1,$2)", [b, admin]), "kuota_penuh");
  assert.equal(await scalar("select ubah_kuota_divisi($1,0,$2)", [division, admin]), "kuota_kurang_dari_terisi");
  assert.equal(await scalar("select ubah_jadwal_pemagang($1,$2,'2030-03-01','2030-04-01')", [a, admin]), "ok");
  assert.equal(await scalar("select terima_pendaftar($1,$2)", [b, admin]), "ok");
  assert.equal(await scalar("select ubah_jadwal_pemagang($1,$2,'2030-01-01','2030-02-01')", [a, admin]), "kuota_penuh");
  assert.equal(await scalar("select tanggal_mulai::text from applicants where id=$1", [a]), "2030-03-01");
  assert.equal(await scalar("select batalkan_pendaftar($1,$2,'Peserta mengundurkan diri')", [b, admin]), "ok");
  assert.equal(await scalar("select status::text from applicants where id=$1", [b]), "dibatalkan");
  const activities = (await db.query("select aksi from aktivitas_pendaftar where applicant_id=$1 order by waktu", [a])).rows.map(r=>r.aksi);
  assert.deepEqual(activities, ["input_manual", "terima", "ubah_jadwal"]);
  assert.equal(await scalar("select ubah_kuota_divisi($1,2,$2)", [division, admin]), "ok");
  assert.equal(await scalar("select count(*)::int from aktivitas_kuota where divisi_id=$1", [division]), 1);
});

test("mutasi browser ditolak, trigger mencegah bypass service-role", async () => {
  assert.equal(await scalar("select has_table_privilege('authenticated','public.applicants','UPDATE')"), false);
  assert.equal(await scalar("select has_function_privilege('authenticated','public.terima_pendaftar(uuid,uuid)','EXECUTE')"), false);
  const id = await session("4001", { manual: true, divisi: division });
  await save(id, admin);
  await assert.rejects(db.query("update applicants set status='diterima', tanggal_selesai='2030-01-02' where id=$1", [id]), /tanggal_tidak_valid|check constraint/);
});

test("input manual diterima dan audit tersimpan dalam satu finalisasi", async () => {
  const other = await scalar("select id from divisi order by urutan offset 1 limit 1");
  await db.query("update divisi set kuota=1 where id=$1", [other]);
  const id = await session("5001", { manual: true, files: false, divisi: other, statusAwal: "diterima" });
  assert.equal((await save(id, admin)).status, "diterima");
  assert.equal((await save(id, admin)).alreadySaved, true);
  assert.equal(await scalar("select count(*)::int from aktivitas_pendaftar where applicant_id=$1", [id]), 2);
  const full = await session("5002", { manual: true, divisi: other, statusAwal: "diterima" });
  const result = await save(full, admin);
  assert.equal(result.status, "pending");
  assert.equal(result.notice, "kuota_penuh");
  assert.equal(await scalar("select batalkan_unggahan($1,$2)", [full, admin]), false);
});

test("perubahan divisi dan penolakan mempunyai audit atomik", async () => {
  const id = await session("6001");
  await save(id);
  assert.equal(await scalar("select ubah_divisi_pendaftar($1,$2,$3)", [id, admin, division]), "ok");
  assert.equal(await scalar("select tolak_pendaftar($1,$2,'Dokumen tidak lengkap')", [id, admin]), "ok");
  assert.equal(await scalar("select terima_pendaftar($1,$2)", [id, admin]), "sudah_diproses");
  const rows = (await db.query("select aksi,detail from aktivitas_pendaftar where applicant_id=$1 order by waktu", [id])).rows;
  assert.equal(rows[0].aksi, "ubah_divisi");
  assert.deepEqual(rows[0].detail, { dari: null, ke: division });
  assert.equal(rows[1].aksi, "tolak");
});

test("skema baru dan migrasi memakai implementasi fondasi yang sama", async () => {
  const schema = await sqlFile("schema.sql");
  assert.equal(schema.split("-- Fondasi aplikasi: jaga bagian ini selaras dengan migration_fondasi.sql.\n")[1], await sqlFile("migration_fondasi.sql"));
});

test("migrasi database lama berhasil dan aman dijalankan ulang", async () => {
  const old = new PGlite();
  try {
    await old.exec(setup);
    const baseline = (await sqlFile("schema.sql")).split("-- Fondasi aplikasi:")[0].replace("'ditolak', 'dibatalkan'", "'ditolak'");
    await old.exec(withoutExtension(baseline));
    // Simulasikan database produksi lama yang sudah memiliki riwayat kirim.
    await old.exec(`create table public.email_logs(id uuid primary key default gen_random_uuid(), tipe text, status_kirim text);
      insert into public.email_logs(tipe,status_kirim) values ('diterima','terkirim');
      grant select,insert,update,delete on public.email_logs to authenticated;`);
    await old.exec(await sqlFile("migration_fondasi_enum.sql"));
    const migration = await sqlFile("migration_fondasi.sql");
    await old.exec(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,nim,tanggal_mulai,tanggal_selesai)
      select 'Duplikat','test@example.com','08123456789','Kampus','Informatika','9001','2030-01-01','2030-02-01' from generate_series(1,2)`);
    await assert.rejects(old.exec(migration), /Duplikat pendaftaran/);
    await old.exec("rollback");
    assert.equal((await old.query("select count(*)::int as jumlah from applicants where nim='9001'")).rows[0].jumlah, 2);
    // Hanya fixture dalam memori; migrasi sendiri tidak menghapus data pengguna.
    await old.exec("delete from applicants where nim='9001'");
    await old.exec(migration);
    await old.exec(migration);
    assert.equal((await old.query("select count(*)::int as jumlah from email_logs where tipe='diterima' and status_kirim='terkirim'")).rows[0].jumlah, 1);
    assert.equal((await old.query("select has_table_privilege('authenticated','public.email_logs','INSERT') as boleh")).rows[0].boleh, false);
    const columns = await old.query("select column_name from information_schema.columns where table_name='applicants' and column_name='catatan_batal'");
    assert.equal(columns.rows.length, 1);
  } finally { await old.close(); }
});

test("migrasi cocok dengan divisi wajib dan riwayat aktivitas yang sudah ada", async () => {
  const old = new PGlite();
  try {
    await old.exec(setup);
    const baseline = (await sqlFile("schema.sql")).split("-- Fondasi aplikasi:")[0];
    await old.exec(withoutExtension(baseline));
    await old.exec(`alter table applicants alter column divisi_id set not null;
      alter table applicants alter column created_at drop not null;
      create table aktivitas_pendaftar (
        id uuid primary key default gen_random_uuid(),
        applicant_id uuid not null references applicants(id) on delete cascade,
        aksi text not null, detail jsonb, oleh uuid references admins(user_id) on delete set null,
        waktu timestamptz not null default now()
      );`);
    const division = (await old.query("select id from divisi limit 1")).rows[0].id;
    const row = (await old.query(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,nim,divisi_id,tanggal_mulai,tanggal_selesai,created_at)
      values('Uji','test@example.com','08123456789','Kampus','Informatika','9911',$1,'2030-01-01','2030-02-01',null) returning id`, [division])).rows[0];
    const migration = await sqlFile("migration_fondasi.sql");
    await assert.rejects(old.exec(migration), /created_at kosong/);
    await old.exec("rollback");
    // Fixture saja: waktu sebenarnya pada database aktif harus ditinjau pengelola.
    await old.query("update applicants set created_at='2026-01-01T00:00:00Z' where id=$1", [row.id]);
    await old.exec(migration);
    await old.query("update applicants set divisi_id=null where id=$1", [row.id]);
    assert.equal((await old.query("select divisi_id from applicants where id=$1", [row.id])).rows[0].divisi_id, null);
    assert.equal((await old.query("select is_nullable from information_schema.columns where table_name='applicants' and column_name='created_at'")).rows[0].is_nullable, "NO");
  } finally { await old.close(); }
});

test("pemeriksaan pra-migrasi hanya membaca data dan mendeteksi kelebihan kapasitas", async () => {
  const preflight = await sqlFile("preflight_fondasi.sql");
  const before = await scalar("select count(*)::int from applicants");
  const peakBefore = await scalar("select sum(kuota)::int from divisi");
  const options = { onNotice: (notice) => notices.push(notice.message) };
  await db.exec(preflight, options);
  let report = JSON.parse(notices.filter((message) => message.startsWith("FONDASI_PREFLIGHT ")).at(-1).slice("FONDASI_PREFLIGHT ".length));
  assert.equal(report.status, "DATA_CHECKS_CLEAR");
  assert.equal(await scalar("select count(*)::int from applicants"), before);
  assert.equal(await scalar("select sum(kuota)::int from divisi"), peakBefore);
  // Buat inkonsistensi hanya dalam fixture lokal untuk menguji pemeriksaannya.
  await db.exec("alter table divisi disable trigger divisi_quota_guard");
  try {
    await db.query("update divisi set kuota=0 where id=$1", [division]);
    await db.exec(preflight, options);
    report = JSON.parse(notices.filter((message) => message.startsWith("FONDASI_PREFLIGHT ")).at(-1).slice("FONDASI_PREFLIGHT ".length));
    assert.equal(report.status, "REVIEW_REQUIRED");
    assert.ok(report.divisi_melebihi_kuota.some((row) => row.divisi_id === division));
    assert.equal(await scalar("select count(*)::int from applicants"), before);
  } finally {
    await db.query("update divisi set kuota=2 where id=$1", [division]);
    await db.exec("alter table divisi enable trigger divisi_quota_guard");
  }
});

test("izin minimum mencabut grant ALL lama termasuk TRUNCATE tanpa mengganggu service_role", async () => {
  const local = new PGlite();
  try {
    await local.exec(setup);
    await local.exec(withoutExtension(await sqlFile("schema.sql")));
    await local.exec(`grant all privileges on admins,applicants,divisi,aktivitas_pendaftar,aktivitas_kuota,sesi_unggahan to anon,authenticated;
      alter default privileges in schema public grant all privileges on tables to anon,authenticated;`);
    await local.exec(await sqlFile("migration_akses_minimum.sql"));
    for (const table of ["admins", "applicants", "divisi", "aktivitas_pendaftar"]) {
      assert.equal((await local.query("select has_table_privilege('anon',$1,'TRUNCATE') as boleh", [`public.${table}`])).rows[0].boleh, false);
    }
    await local.exec(await sqlFile("migration_fondasi.sql"));
    for (const table of ["admins", "applicants", "divisi", "aktivitas_pendaftar", "aktivitas_kuota", "sesi_unggahan"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          assert.equal((await local.query("select has_table_privilege($1,$2,$3) as boleh", [role, `public.${table}`, privilege])).rows[0].boleh, false, `${role}/${table}/${privilege}`);
        }
        assert.equal((await local.query("select has_table_privilege($1,$2,'SELECT') as boleh", [role, `public.${table}`])).rows[0].boleh,
          table === "divisi" || (role === "authenticated" && table !== "sesi_unggahan"));
      }
      assert.equal((await local.query("select has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE') as boleh", [`public.${table}`])).rows[0].boleh, true);
    }
    await local.exec("set role anon");
    try { await assert.rejects(local.exec("truncate public.aktivitas_pendaftar"), /permission denied/); }
    finally { await local.exec("reset role"); }
  } finally { await local.close(); }
});

test("reset data uji mengosongkan transaksi tanpa menghapus struktur, admin, atau divisi", async () => {
  const local = new PGlite();
  try {
    await local.exec(setup);
    await local.exec(withoutExtension(await sqlFile("schema.sql")));
    const actor = randomUUID();
    await local.query("insert into auth.users values($1)", [actor]);
    await local.query("insert into admins values($1,'Admin tetap')", [actor]);
    const participant = (await local.query(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,nim,tanggal_mulai,tanggal_selesai)
      values('Uji','test@example.com','08123456789','Kampus','Informatika','reset1','2030-01-01','2030-02-01') returning id`)).rows[0].id;
    await local.query("insert into aktivitas_pendaftar(applicant_id,aksi,oleh) values($1,'input_manual',$2)", [participant, actor]);
    await local.exec(`create table email_logs(applicant_id uuid references applicants(id), pesan text)`);
    await local.query("insert into email_logs values($1,'uji')", [participant]);
    await local.exec(await sqlFile("reset_data_uji.sql"));
    for (const name of ["applicants", "aktivitas_pendaftar", "sesi_unggahan", "aktivitas_kuota", "email_logs"]) {
      assert.equal((await local.query(`select count(*)::int as jumlah from public.${name}`)).rows[0].jumlah, 0);
    }
    assert.equal((await local.query("select count(*)::int as jumlah from admins")).rows[0].jumlah, 1);
    assert.equal((await local.query("select count(*)::int as jumlah from auth.users")).rows[0].jumlah, 1);
    assert.equal((await local.query("select count(*)::int as jumlah from divisi")).rows[0].jumlah, 5);
    assert.ok((await local.query("select to_regprocedure('public.terima_pendaftar(uuid,uuid)') as fungsi")).rows[0].fungsi);
  } finally { await local.close(); }
});
