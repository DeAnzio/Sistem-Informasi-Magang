'use client';
import type {PreviewApplicant,PreviewStatus} from '@/lib/preview-types';
import s from './preview.module.css';
export const statusNames:Record<PreviewStatus,string>={pending:'Menunggu pemeriksaan',diperiksa:'Pemeriksaan ulang',perbaikan:'Perlu perbaikan',diterima:'Diterima',ditolak:'Ditolak',dibatalkan:'Dibatalkan',tunggu:'Daftar tunggu',selesai:'Selesai magang'};
export const date=(v:string)=>new Date(v).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
export function makeForm(action:string,values:Record<string,string>={}){const f=new FormData();f.set('action',action);Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;}
export async function post(f:FormData){const r=await fetch('/api/preview',{method:'POST',body:f});const d=await r.json();if(!r.ok)throw Error(d.error||'Permintaan gagal.');return d;}
export function Badge({status}:{status:PreviewStatus}){return <span className={`${s.badge} ${s[status]}`}>{statusNames[status]}</span>;}
export type PublicApplicant=Omit<PreviewApplicant,'id'|'email'|'nim'|'no_hp'|'asal_kampus'|'jurusan'|'files'>&{files:{name:string;kind:string;version:number}[]};
export type Runner=(fn:()=>Promise<void>)=>Promise<void>;
export function PageTitle({title,text}:{title:string;text:string}){return <div className={s.pageTitle}><p className={s.eyebrow}>Layanan permagangan</p><h1>{title}</h1><p>{text}</p></div>;}
