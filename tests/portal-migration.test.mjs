import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// SQL PostgreSQL nyata dalam memori. Auth dan metadata Storage memakai stub.
// Bukan bukti perilaku multi-koneksi, PostgREST, atau Storage Supabase nyata.
const file=async name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8');
const setup=`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema storage; create table storage.objects(bucket_id text,name text,metadata jsonb);`;
const db=new PGlite();
const admin=randomUUID();
let division,legacyId;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const fullReview={identity:true,cv:true,surat:true,schedule:true};
async function base(target){
  await target.exec(setup);
  await target.exec((await file('schema.sql')).replace('create extension if not exists pgcrypto;',''));
  await target.exec('alter table applicants rename constraint applicants_nim_divisi_id_tanggal_mulai_key to applicants_unik');
  // Variasi yang teramati pada staging: overload 4 parameter,
  // serta riwayat email lama yang harus tetap dipertahankan.
  await target.exec(`create table email_logs(id uuid primary key,tipe text);
    insert into email_logs values(gen_random_uuid(),'arsip');
    create or replace function sisa_kuota_rentang(p_divisi uuid,p_mulai date,p_selesai date,p_kecuali uuid default null)
    returns int language sql as $$ select 99 $$;`);
}
async function migrate(target){
  for(const name of ['migration_portal_01_enum.sql','migration_portal_02_struktur.sql','migration_portal_03_alur.sql','migration_portal_04_integrasi.sql'])
    await target.exec(await file(name));
}
async function applicant(email=`${randomUUID()}@example.com`,dates=['2020-01-01','2020-02-01']){
  return scalar(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,divisi_id,tanggal_mulai,tanggal_selesai)
  values('Uji',$1,'08123456789','Kampus','Jurusan',$2,$3,$4) returning id`,[email,division,...dates]);
}
async function review(id){await db.query('update applicants set pemeriksaan=$2 where id=$1',[id,fullReview]);}
async function decide(id,status,message='Pesan keputusan',notes={}){
  return db.query('select portal_putuskan($1,$2,$3,$4,$5,$6)',[id,admin,status,division,message,notes]);
}
async function document(id,kind,version=1){
  const path=`${id}/${randomUUID()}.pdf`;
  await db.query("insert into storage.objects values('berkas',$1,$2)",[path,{size:100,mimetype:'application/pdf'}]);
  return scalar(`insert into dokumen_pendaftar(applicant_id,jenis,versi,storage_path,nama_asli,mime_type,ukuran)
    values($1,$2,$3,$4,'contoh.pdf','application/pdf',100) returning id`,[id,kind,version,path]);
}
before(async()=>{
  await base(db);
  await db.query("insert into auth.users values($1)",[admin]);
  await db.query("insert into admins values($1,'Petugas Uji')",[admin]);
  division=await scalar('select id from divisi order by urutan limit 1');
  await db.query('update divisi set kuota=1 where id=$1',[division]);
  legacyId=await scalar(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,nim,tanggal_mulai,tanggal_selesai)
    values('Lama','Lama@Example.com','08123456789','Kampus','Jurusan','NIM-LAMA','2021-01-01','2021-02-01') returning id`);
  await migrate(db);
});
after(()=>db.close());

test('portal: migrasi berulang mempertahankan data, NIM lama, dan arsip email',async()=>{
  await migrate(db);
  assert.equal(await scalar('select nim from applicants where id=$1',[legacyId]),'NIM-LAMA');
  assert.equal(await scalar('select email from applicants where id=$1',[legacyId]),'Lama@Example.com');
  assert.equal(await scalar('select count(*)::int from email_logs'),1);
  assert.equal(await scalar('select pendaftaran_dibuka from pengaturan_layanan'),false);
});
test('portal: email aktif unik tanpa membedakan kapital/spasi; NIM opsional',async()=>{
  const a=await applicant(' Baru@Example.com ');
  assert.equal(await scalar('select email from applicants where id=$1',[a]),'baru@example.com');
  assert.equal(await scalar('select nim from applicants where id=$1',[a]),null);
  await assert.rejects(applicant('BARU@example.com'),/applicants_email_aktif_unique/);
  await decide(a,'ditolak');
  const b=await applicant('baru@example.com');
  await assert.rejects(decide(a,'pending'),/applicants_email_aktif_unique/);
  assert.equal(await scalar('select status::text from applicants where id=$1',[a]),'ditolak');
  await decide(b,'ditolak');
});
test('portal: telepon dan durasi tetap ditegakkan database',async()=>{
  const a=await applicant();
  await assert.rejects(db.query("update applicants set no_hp='+628123456789' where id=$1",[a]),/portal_telepon/);
  await db.query("update applicants set no_hp='0812-3456 789' where id=$1",[a]);
  assert.equal(await scalar('select no_hp from applicants where id=$1',[a]),'08123456789');
  await assert.rejects(db.query("update applicants set tanggal_selesai=tanggal_mulai+1 where id=$1",[a]),/tanggal_tidak_valid|portal_durasi/);
});
test('portal: kedua signature kuota tetap tersedia dan hasilnya konsisten',async()=>{
  const x=await scalar("select sisa_kuota_rentang($1,'2035-01-01'::date,'2035-02-01'::date)",[division]);
  const y=await scalar("select sisa_kuota_rentang($1,'2035-01-01'::date,'2035-02-01'::date,null::uuid)",[division]);
  assert.equal(x,y); assert.equal(x,1);
});
test('portal: checklist, daftar tunggu, promosi dan kuota divisi',async()=>{
  const a=await applicant(); const b=await applicant();
  await assert.rejects(decide(a,'diterima'),/pemeriksaan_belum_lengkap/);
  await review(a); await review(b);
  await assert.rejects(decide(b,'tunggu'),/kuota_masih_tersedia/);
  await decide(a,'diterima');
  await assert.rejects(decide(b,'diterima'),/kuota_penuh/);
  await decide(b,'tunggu');
  assert.ok(await scalar('select daftar_tunggu_at from applicants where id=$1',[b]));
  await assert.rejects(db.query('update divisi set kuota=0 where id=$1',[division]),/kuota_kurang_dari_terisi/);
  await decide(a,'dibatalkan'); await decide(b,'diterima'); await decide(b,'dibatalkan');
});
test('portal: revisi wajib mengganti semua berkas yang diminta dan reset checklist',async()=>{
  const a=await applicant(); await review(a);
  await decide(a,'perbaikan','Perbaiki dokumen',{cv:'CV perlu diperbarui',surat:'Surat belum sesuai'});
  await assert.rejects(db.query('select portal_kirim_perbaikan($1)',[a]),/berkas_perbaikan_belum_lengkap/);
  await document(a,'cv');
  await assert.rejects(db.query('select portal_kirim_perbaikan($1)',[a]),/berkas_perbaikan_belum_lengkap/);
  await document(a,'surat'); await db.query('select portal_kirim_perbaikan($1)',[a]);
  assert.equal(await scalar('select status::text from applicants where id=$1',[a]),'diperiksa');
  assert.equal((await scalar('select pemeriksaan from applicants where id=$1',[a])).cv,false);
  await assert.rejects(document(a,'cv',2),/status_unggahan_tidak_valid/);
});
test('portal: berkas tidak boleh merujuk objek Storage yang tidak tervalidasi',async()=>{
  const a=await applicant();
  await assert.rejects(db.query(`insert into dokumen_pendaftar(applicant_id,jenis,versi,storage_path,nama_asli,mime_type,ukuran)
    values($1,'cv',1,$2,'x.pdf','application/pdf',100)`,[a,`${a}/missing.pdf`]),/berkas_storage_tidak_valid/);
});
test('portal: penyelesaian, riwayat kuota dan survei satu kali',async()=>{
  const a=await applicant(); await review(a); await decide(a,'diterima');
  await assert.rejects(db.query('insert into survei_magang values($1,5,5,5,5,\'\',now())',[a]),/survei_hanya_setelah_selesai/);
  const doc=await document(a,'laporan');
  await db.query('insert into penyelesaian_magang(applicant_id,dokumen_id) values($1,$2)',[a,doc]);
  await db.query('select portal_periksa_laporan($1,$2,true,$3)',[a,admin,'Laporan disetujui']);
  assert.equal(await scalar('select status::text from applicants where id=$1',[a]),'selesai');
  assert.equal(await scalar("select okupansi_maksimum($1,'2020-01-01','2020-02-01')",[division]),1);
  await assert.rejects(db.query("update applicants set tanggal_selesai='2020-03-01' where id=$1",[a]),/riwayat_selesai/);
  await db.query('insert into survei_magang(applicant_id,informasi,pendaftaran,pelayanan,pengalaman) values($1,5,4,3,5)',[a]);
  await assert.rejects(db.query('insert into survei_magang(applicant_id,informasi,pendaftaran,pelayanan,pengalaman) values($1,5,4,3,5)',[a]),/survei_magang_pkey/);
  await assert.rejects(db.query('update survei_magang set informasi=1 where applicant_id=$1',[a]),/survei_hanya_sekali/);
});
test('portal: laporan tidak dapat disetujui sebelum akhir periode; kegagalan atomik',async()=>{
  const a=await applicant(undefined,['2090-01-01','2090-02-01']); await review(a); await decide(a,'diterima');
  const doc=await document(a,'laporan');
  await db.query('insert into penyelesaian_magang(applicant_id,dokumen_id) values($1,$2)',[a,doc]);
  await assert.rejects(db.query('select portal_periksa_laporan($1,$2,true,$3)',[a,admin,'Setuju']),/periode_belum_selesai/);
  assert.equal(await scalar('select status from penyelesaian_magang where applicant_id=$1',[a]),'submitted');
  assert.equal(await scalar('select status::text from applicants where id=$1',[a]),'diterima');
});
test('portal: browser tidak dapat mengakses hash pelacakan atau menjalankan RPC mutasi',async()=>{
  for(const role of ['anon','authenticated']){
    assert.equal(await scalar(`select has_table_privilege('${role}','public.akses_pelacakan','SELECT')`),false);
    assert.equal(await scalar(`select has_table_privilege('${role}','public.survei_magang','INSERT')`),false);
    assert.equal(await scalar(`select has_function_privilege('${role}','public.portal_kirim_perbaikan(uuid)','EXECUTE')`),false);
    assert.equal(await scalar(`select has_function_privilege('${role}','public.simpan_pendaftaran(uuid,uuid)','EXECUTE')`),false);
  }
});
test('portal: data duplikat memblokir migrasi tanpa menghapus baris atau constraint lama',async()=>{
  const old=new PGlite();
  try{
    await base(old);
    await old.exec(`insert into applicants(nama,email,no_hp,asal_kampus,jurusan,nim,tanggal_mulai,tanggal_selesai)
      select 'Uji','sama@example.com','08123456789','Kampus','Jurusan',n::text,'2020-01-01','2020-02-01'
      from generate_series(1,2) n;`);
    await old.exec(await file('migration_portal_01_enum.sql'));
    await assert.rejects(old.exec(await file('migration_portal_02_struktur.sql')),/Email aktif duplikat/);
    await old.exec('rollback');
    assert.equal((await old.query('select count(*)::int n from applicants')).rows[0].n,2);
    assert.equal((await old.query("select count(*)::int n from pg_constraint where conname='applicants_unik'")).rows[0].n,1);
  }finally{await old.close();}
});

test('portal: RLS hanya memperlihatkan metadata dokumen kepada admin terdaftar',async()=>{
  const id=await applicant(); await document(id,'cv');
  await db.exec('set role authenticated');
  try{
    assert.equal(await scalar('select count(*)::int from dokumen_pendaftar'),0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
    assert.ok(await scalar('select count(*)::int from dokumen_pendaftar')>0);
    await assert.rejects(db.query('select portal_kirim_perbaikan($1)',[id]),/permission denied/);
  }finally{await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','',false)");}
});

test('portal: laporan revisi wajib memakai dokumen baru dan audit keputusan tersimpan',async()=>{
  const id=await applicant(undefined,['2022-01-01','2022-02-01']); await review(id); await decide(id,'diterima');
  const doc=await document(id,'laporan');
  await db.query('insert into penyelesaian_magang(applicant_id,dokumen_id) values($1,$2)',[id,doc]);
  await db.query('select portal_periksa_laporan($1,$2,false,$3)',[id,admin,'Tambahkan kesimpulan']);
  await assert.rejects(db.query("update penyelesaian_magang set status='submitted' where applicant_id=$1",[id]),/alur_laporan_tidak_valid/);
  const revised=await document(id,'laporan',2);
  await db.query("update penyelesaian_magang set status='submitted',dokumen_id=$2 where applicant_id=$1",[id,revised]);
  await db.query('select portal_periksa_laporan($1,$2,true,$3)',[id,admin,'Laporan lengkap']);
  assert.equal(await scalar("select count(*)::int from aktivitas_pendaftar where applicant_id=$1 and aksi='portal_periksa_laporan'",[id]),2);
});

test('portal: dependensi overload kuota menghentikan perubahan tanpa CASCADE',async()=>{
  const old=new PGlite();
  try{
    await base(old);
    await old.exec("create view dependent_quota as select sisa_kuota_rentang(null::uuid,'2020-01-01'::date,'2020-02-01'::date,null::uuid) as sisa");
    await old.exec(await file('migration_portal_01_enum.sql'));
    await old.exec(await file('migration_portal_02_struktur.sql'));
    await assert.rejects(old.exec(await file('migration_portal_03_alur.sql')),/depend/);
    await old.exec('rollback');
    assert.equal((await old.query('select sisa from dependent_quota')).rows[0].sisa,99);
  }finally{await old.close();}
});

test('portal: query verifikasi pascamigrasi dapat dijalankan',async()=>{
  await db.exec(await file('verify_portal_staging.sql'));
  await db.exec(await file('verify_portal_integrasi.sql'));
});

async function uploadSession({missing=false}={}){
  const id=randomUUID(),session=randomUUID();
  const files=['cv','surat'].map(kind=>({kind,path:`${id}/${session}/${kind}.pdf`,name:`${kind}.pdf`,type:'application/pdf',size:100}));
  for(const f of missing?files.slice(0,1):files)await db.query("insert into storage.objects values('berkas',$1,$2)",[f.path,{mimetype:f.type,size:f.size}]);
  await db.query(`insert into portal_sesi_unggahan(id,applicant_id,aksi,payload,expires_at) values($1,$2,'register',$3,now()+interval '15 minutes')`,
    [session,id,{applicant:{nama:'Baru',email:`${id}@example.com`,no_hp:'08123456789',asal_kampus:'Kampus',jurusan:'Jurusan',tanggal_mulai:'2030-01-01',tanggal_selesai:'2030-02-01'},
      token_hash:id.replaceAll('-','').repeat(2),files}]);
  return {id,session,files};
}
test('portal integrasi: finalisasi atomik, retry idempoten, dan cleanup tidak menghapus sesi tersimpan',async()=>{
  await db.exec('update pengaturan_layanan set pendaftaran_dibuka=true');
  const {id,session}=await uploadSession();
  assert.equal(await scalar('select portal_finalisasi_unggahan($1)',[session]),id);
  assert.equal(await scalar('select portal_finalisasi_unggahan($1)',[session]),id);
  assert.equal(await scalar('select count(*)::int from dokumen_pendaftar where applicant_id=$1',[id]),2);
  assert.equal(await scalar('select portal_batalkan_sesi($1)',[session]),false);
});
test('portal integrasi: unggahan tidak lengkap menggagalkan seluruh pendaftaran dan dapat dicoba ulang',async()=>{
  const {id,session,files}=await uploadSession({missing:true});
  await assert.rejects(db.query('select portal_finalisasi_unggahan($1)',[session]),/berkas_storage_tidak_valid/);
  assert.equal(await scalar('select count(*)::int from applicants where id=$1',[id]),0);
  assert.equal(await scalar('select count(*)::int from akses_pelacakan where applicant_id=$1',[id]),0);
  await db.query("insert into storage.objects values('berkas',$1,$2)",[files[1].path,{mimetype:'application/pdf',size:100}]);
  assert.equal(await scalar('select portal_finalisasi_unggahan($1)',[session]),id);
});
test('portal integrasi: penutupan layanan setelah tiket dibuat tetap menolak finalisasi',async()=>{
  const {session}=await uploadSession();
  await db.exec('update pengaturan_layanan set pendaftaran_dibuka=false');
  await assert.rejects(db.query('select portal_finalisasi_unggahan($1)',[session]),/pendaftaran_ditutup/);
  await db.exec('update pengaturan_layanan set pendaftaran_dibuka=true');
  assert.equal(await scalar('select portal_batalkan_sesi($1)',[session]),true);
  await assert.rejects(db.query('select portal_finalisasi_unggahan($1)',[session]),/tiket_tidak_valid/);
});
test('portal integrasi: batas permintaan dan pengaturan kuota atomik',async()=>{
  assert.equal(await scalar("select portal_batasi('test',2,60)"),true);
  assert.equal(await scalar("select portal_batasi('test',2,60)"),true);
  assert.equal(await scalar("select portal_batasi('test',2,60)"),false);
  const name=await scalar('select nama from divisi where id=$1',[division]);
  const before=await scalar('select pengumuman from pengaturan_layanan');
  await assert.rejects(db.query('select portal_simpan_pengaturan($1,$2)',[admin,{open:false,deadline:'',announcement:'Tidak boleh tersimpan',contact:'Uji',divisions:[{name,quota:0}]}]),/kuota_kurang_dari_terisi/);
  assert.equal(await scalar('select pengumuman from pengaturan_layanan'),before);
});
test('portal integrasi: pengajuan manual dan rotasi kode menyimpan audit',async()=>{
  const fields={nama:'Manual',email:'manual-new@example.com',no_hp:'08123456789',asal_kampus:'Kampus',jurusan:'Jurusan',tanggal_mulai:'2030-01-01',tanggal_selesai:'2030-02-01'};
  const id=await scalar('select portal_input_manual($1,$2,null,$3)',[admin,fields,'1'.repeat(64)]);
  assert.equal(await scalar('select sumber from applicants where id=$1',[id]),'manual');
  await db.query('select portal_terbitkan_kode($1,$2,$3)',[id,admin,'2'.repeat(64)]);
  assert.equal(await scalar('select token_hash from akses_pelacakan where applicant_id=$1',[id]),'2'.repeat(64));
});
