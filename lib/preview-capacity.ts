import type {PreviewApplicant,PreviewSettings} from './preview-types';
export type PublicCapacity={name:string;quota:number;current:number;upcoming:number;remaining:number};
export function publicCapacity(settings:PreviewSettings,rows:PreviewApplicant[],today:string):PublicCapacity[]{return settings.divisions.map(d=>{
 const participants=rows.filter(p=>p.divisi===d.name&&['diterima','selesai'].includes(p.status));
 const current=participants.filter(p=>p.tanggal_mulai<=today&&p.tanggal_selesai>=today).length;
 const upcoming=participants.filter(p=>p.status==='diterima'&&p.tanggal_mulai>today).length;
 return {name:d.name,quota:d.quota,current,upcoming,remaining:Math.max(0,d.quota-current)};
});}
