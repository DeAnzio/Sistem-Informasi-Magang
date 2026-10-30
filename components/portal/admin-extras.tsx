'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {post,makeForm,type Runner} from './preview-shared';
import {previewApplicantSchema} from '@/lib/preview-applicant-schema';
import type {PreviewApplicant} from '@/lib/preview-types';
import s from './preview.module.css';
export function AdminExtras({p,run,busy,reload}:{p:PreviewApplicant;run:Runner;busy:boolean;reload:()=>Promise<void>}){
  const [code,setCode]=useState('');
  return <section className={s.panel}><h3>Kode pelacakan peserta</h3><p>Kode lama tidak dapat dibaca kembali. Terbitkan kode baru bila peserta kehilangan kode atau belum memilikinya. Sampaikan secara pribadi kepada peserta.</p>
    <button disabled={busy} className={s.secondary} onClick={()=>{if(window.confirm('Terbitkan kode baru? Kode sebelumnya langsung tidak berlaku.'))void run(async()=>{const d=await post(makeForm('rotate-code',{id:p.id}));setCode(d.code);});}}>Terbitkan kode baru</button>
    {code&&<p role='status'>Simpan dan sampaikan kode ini: <strong className={s.code}>{code}</strong></p>}
    {['pending','diterima'].includes(p.status)&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set('id',p.id);f.set('action','schedule');void run(async()=>{await post(f);await reload();});}}>
      <h3>Penyesuaian jadwal</h3><div className={s.fields}><label>Tanggal mulai<input type='date' name='start' required defaultValue={p.tanggal_mulai}/></label><label>Tanggal selesai<input type='date' name='end' required defaultValue={p.tanggal_selesai}/></label></div><button disabled={busy} className={s.secondary}>Simpan jadwal</button></form>}
  </section>;
}
export function ManualApplicant(){
  const router=useRouter();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<{id:string;code:string}|null>(null);
  return <main className={s.site}><section className={s.main}><h1>Catat pengajuan manual</h1><p>Pengajuan masuk ke antrean pemeriksaan. Penempatan dan penerimaan dilakukan setelah pemeriksaan dokumen.</p>
    {error&&<p role='alert' className={s.error}>{error}</p>}{result?<div className={s.panel}><p>Pengajuan tersimpan. Sampaikan kode ini secara pribadi kepada peserta:</p><strong className={s.code}>{result.code}</strong><button className={s.primary} onClick={()=>router.push('/admin/pengajuan?id='+result.id)}>Buka pengajuan</button></div>:
    <form className={s.panel} onSubmit={async e=>{e.preventDefault();setError('');const f=new FormData(e.currentTarget);const parsed=previewApplicantSchema.safeParse(Object.fromEntries(f));if(!parsed.success){setError(parsed.error.issues.map(i=>i.message).join(' '));return;}setBusy(true);try{f.set('action','manual');setResult(await post(f));}catch(e){setError(e instanceof Error?e.message:'Pengajuan gagal disimpan.');}finally{setBusy(false);}}}>
      <fieldset disabled={busy}><div className={s.fields}>{[['nama','Nama','text'],['email','Email','email'],['no_hp','Telepon berawalan 08','tel'],['asal_kampus','Asal pendidikan','text'],['jurusan','Jurusan','text'],['tanggal_mulai','Tanggal mulai','date'],['tanggal_selesai','Tanggal selesai','date']].map(([key,label,type])=><label key={key}>{label}<input name={key} type={type} required/></label>)}</div><button className={s.primary}>{busy?'Menyimpan…':'Simpan pengajuan'}</button></fieldset>
    </form>}<p><Link href='/admin/pengajuan'>Kembali ke daftar pengajuan</Link></p></section></main>;
}
