import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {PortalDatabase,PortalApplicant} from './portal-database';
import type {PreviewApplicant,PreviewReview,PreviewSettings} from './preview-types';
import {hashCode} from './portal-security';
import {readAllPages} from './read-all-pages';

export function portalDb(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('Konfigurasi Supabase belum tersedia.');
  return createClient<PortalDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export type PortalClient=ReturnType<typeof portalDb>;
export function checked<T>(result:{data:T;error:unknown}):T{if(result.error)throw result.error;return result.data;}
export function required<T>(result:{data:T;error:unknown}):NonNullable<T>{const data=checked(result);if(data==null)throw Error('Data tidak ditemukan.');return data;}
export async function settings(db:PortalClient):Promise<PreviewSettings>{
  const cfg=required(await db.from('pengaturan_layanan').select('*').eq('id',true).single());
  const divisions=required(await db.from('divisi').select('*').eq('aktif',true).order('urutan'));
  return {open:cfg.pendaftaran_dibuka,deadline:cfg.batas_pendaftaran||'',announcement:cfg.pengumuman,contact:cfg.kontak,
    divisions:divisions.map(d=>({name:d.nama,quota:d.kuota}))};
}
export async function trackingId(db:PortalClient,code:string){
  const access=checked(await db.from('akses_pelacakan').select('applicant_id').eq('token_hash',hashCode(code)).is('revoked_at',null).maybeSingle());
  return access?.applicant_id||null;
}
const actionText:Record<string,string>={portal_daftar:'Pengajuan berhasil dikirim',portal_keputusan:'Petugas memperbarui keputusan',
  portal_kirim_perbaikan:'Pendaftar mengirim berkas perbaikan',portal_kirim_laporan:'Peserta mengirim laporan akhir',
  portal_periksa_laporan:'Petugas memeriksa laporan akhir',portal_survei:'Peserta mengisi survei kepuasan',
  portal_pemeriksaan:'Petugas menyimpan daftar pemeriksaan berkas',terima:'Pengajuan diterima',tolak:'Pengajuan ditolak',
  batalkan:'Pengajuan dibatalkan',ubah_jadwal:'Petugas memperbarui jadwal',ubah_divisi:'Petugas memperbarui penempatan',input_manual:'Pengajuan dicatat petugas'};
export async function hydrate(db:PortalClient,a:PortalApplicant,divisionName:string):Promise<PreviewApplicant>{
  const [docs,completion,survey,history]=await Promise.all([
    db.from('dokumen_pendaftar').select('*').eq('applicant_id',a.id).order('created_at'),
    db.from('penyelesaian_magang').select('*').eq('applicant_id',a.id).maybeSingle(),
    db.from('survei_magang').select('*').eq('applicant_id',a.id).maybeSingle(),
    db.from('aktivitas_pendaftar').select('waktu,aksi',{count:'exact'}).eq('applicant_id',a.id).order('waktu'),
  ]);
  const docRows=required(docs),c=checked(completion),s=checked(survey);let h=required(history);
  if(history.count!==null&&h.length<history.count)h=await readAllPages((from,to)=>db.from('aktivitas_pendaftar').select('waktu,aksi',{count:'exact'})
    .eq('applicant_id',a.id).order('waktu').order('id').range(from,to),history.count);
  const files=docRows.map(d=>({id:d.id,name:d.nama_asli,type:d.mime_type,kind:d.jenis,version:d.versi}));
  for(const [kind,path] of [['cv',a.berkas_cv],['surat',a.berkas_surat_pengantar]]){
    if(path&&!docRows.some(d=>d.storage_path===path))files.unshift({id:`legacy:${a.id}:${kind}`,name:kind==='cv'?'CV terdahulu':'Surat pengantar terdahulu',
      type:path.endsWith('.pdf')?'application/pdf':path.endsWith('.png')?'image/png':'image/jpeg',kind:kind!,version:0});
  }
  return {id:a.id,code:'',nama:a.nama,email:a.email,no_hp:a.no_hp,asal_kampus:a.asal_kampus,jurusan:a.jurusan,
    tanggal_mulai:a.tanggal_mulai,tanggal_selesai:a.tanggal_selesai,status:a.status,divisi:divisionName,
    pesan:a.pesan_pendaftar,created:a.created_at,files,review:a.pemeriksaan as PreviewReview,
    revisionNotes:a.catatan_perbaikan as Record<string,string>,waitlistedAt:a.daftar_tunggu_at||undefined,
    completion:c?{state:c.status,message:c.pesan,submittedAt:c.submitted_at,approvedAt:c.approved_at||undefined}:undefined,
    survey:s?{scores:[s.informasi,s.pendaftaran,s.pelayanan,s.pengalaman],comment:s.komentar,at:s.created_at}:undefined,
    surveySubmitted:!!s,history:h.filter(x=>actionText[x.aksi]).map(x=>({at:x.waktu,text:actionText[x.aksi]}))};
}
export function publicApplicant(p:PreviewApplicant,code:string){return {
  code,nama:p.nama,tanggal_mulai:p.tanggal_mulai,tanggal_selesai:p.tanggal_selesai,status:p.status,divisi:p.divisi,
  pesan:p.pesan,created:p.created,revisionNotes:p.revisionNotes,completion:p.completion,surveySubmitted:!!p.survey,
  waitlistedAt:p.waitlistedAt,history:p.history,files:p.files.map(f=>({name:f.name,kind:f.kind,version:f.version})),
};}
export async function oneApplicant(db:PortalClient,id:string){
  const a=required(await db.from('applicants').select('*').eq('id',id).single());
  const d=a.divisi_id?checked(await db.from('divisi').select('nama').eq('id',a.divisi_id).single()):null;
  return hydrate(db,a,d?.nama||'');
}
export async function allApplicants(db:PortalClient){
  const first=await db.from('applicants').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id');
  let rows=required(first);
  if(first.count===null)throw Error('Jumlah pengajuan belum tersedia.');
  if(rows.length<first.count)rows=await readAllPages((from,to)=>db.from('applicants').select('*',{count:'exact'})
    .order('created_at',{ascending:false}).order('id').range(from,to),first.count);
  const divisions=required(await db.from('divisi').select('id,nama'));
  // Batasi paralelisme agar pemuatan rekap tidak membanjiri koneksi database.
  const result:PreviewApplicant[]=[];
  for(let i=0;i<rows.length;i+=10)result.push(...await Promise.all(rows.slice(i,i+10).map(a=>hydrate(db,a,divisions.find(d=>d.id===a.divisi_id)?.nama||''))));
  return result;
}
