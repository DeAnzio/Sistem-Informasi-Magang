'use client';
import type {PreviewApplicant,PreviewStatus} from '@/lib/preview-types';
import s from './preview.module.css';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';
export const statusNames:Record<PreviewStatus,string>={pending:'Menunggu pemeriksaan',diperiksa:'Pemeriksaan ulang',perbaikan:'Perlu perbaikan',diterima:'Diterima',ditolak:'Ditolak',dibatalkan:'Dibatalkan',tunggu:'Daftar tunggu',selesai:'Selesai magang'};
export const date=(v:string)=>new Date(v).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
export function makeForm(action:string,values:Record<string,string>={}){const f=new FormData();f.set('action',action);Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;}
async function request(body:Record<string,unknown>){
 const r=await fetch('/api/portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Permintaan gagal.');return d;
}
export async function post(f:FormData){
 const action=String(f.get('action'));
 if(!['register','revise','final-report'].includes(action))return request(Object.fromEntries(f));
 const pendingKey='portal:upload:'+action+':'+String(f.get('code')||'new');
 const previous=sessionStorage.getItem(pendingKey);
 if(previous){
  const saved=JSON.parse(previous) as {ticket:string;code:string};
  try{const result=await request({action:'finalize',ticket:saved.ticket});sessionStorage.removeItem(pendingKey);return result;}
  catch{
   const recovered=await request({action:'recover-upload',ticket:saved.ticket}).catch(()=>null);
   if(recovered?.applicant){sessionStorage.removeItem(pendingKey);return recovered;}
   if(recovered?.restart){sessionStorage.removeItem(pendingKey);throw Error('Sesi lama telah berakhir tanpa tersimpan. Centang ulang Saya bukan robot jika diminta, lalu kirim kembali.');}
   throw Error('Pengiriman sebelumnya belum dapat dikonfirmasi. Coba lagi atau periksa kode '+saved.code+' melalui Lacak pengajuan. Jangan mengirim pengajuan baru dahulu.');
  }
 }
 const files=['cv','surat','laporan'].flatMap(kind=>{const file=f.get(kind);return file instanceof File&&file.size?[{kind,name:file.name,type:file.type,size:file.size}]:[];});
 const fields=Object.fromEntries([...f].filter(([,v])=>typeof v==='string'));
 const prepared=await request({...fields,action:'prepare',operation:action,files});
 const storage=createSupabaseBrowserClient().storage.from('berkas');
 for(const upload of prepared.uploads as {kind:string;path:string;token:string}[]){
  const file=f.get(upload.kind);if(!(file instanceof File))throw Error('Dokumen belum dipilih.');
  const {error}=await storage.uploadToSignedUrl(upload.path,upload.token,file,{contentType:file.type});
  if(error)throw Error('Unggahan gagal. Periksa koneksi lalu pilih ulang berkas dan coba kembali.');
 }
 sessionStorage.setItem(pendingKey,JSON.stringify({ticket:prepared.ticket,code:prepared.code}));
 try{const result=await request({action:'finalize',ticket:prepared.ticket});sessionStorage.removeItem(pendingKey);return result;}
 catch(e){throw Error((e instanceof Error?e.message:'Pengiriman belum dikonfirmasi.')+' Kode pemulihan: '+prepared.code+'. Simpan kode dan coba kirim kembali; dokumen tidak perlu diunggah ulang.');}
}
export function Badge({status}:{status:PreviewStatus}){return <span className={`${s.badge} ${s[status]}`}>{statusNames[status]}</span>;}
export type PublicApplicant=Omit<PreviewApplicant,'id'|'email'|'nim'|'no_hp'|'asal_kampus'|'jurusan'|'files'>&{files:{name:string;kind:string;version:number}[]};
export type Runner=(fn:()=>Promise<void>)=>Promise<void>;
export function PageTitle({title,text}:{title:string;text:string}){return <div className={s.pageTitle}><p className={s.eyebrow}>Layanan permagangan</p><h1>{title}</h1><p>{text}</p></div>;}
