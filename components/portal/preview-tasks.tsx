import Link from 'next/link';
import type {PreviewApplicant} from '@/lib/preview-types';
import {pendingTasks,staffHref} from '@/lib/portal-workflow';
import {date} from './preview-shared';
import s from './preview.module.css';
export function TaskCenter({rows,compact=false}:{rows:PreviewApplicant[];compact?:boolean}) {
  const tasks=pendingTasks(rows);
  const visible=compact?tasks.slice(0,4):tasks;
  return <section className={s.panel}>
    <div className={s.sectionHead}><div><h2>Tugas yang perlu ditindaklanjuti</h2><p>{tasks.length} tugas menunggu. Urutan dari waktu masuk paling awal.</p></div>{compact&&<Link className={s.secondary} href={staffHref('tugas')}>Lihat seluruh tugas</Link>}</div>
    {!compact&&<div className={s.stats}>{[['baru','Pengajuan baru'],['perbaikan','Berkas perbaikan'],['laporan','Laporan akhir']].map(([kind,label])=><article key={kind}><span>{label}</span><strong>{tasks.filter(t=>t.kind===kind).length}</strong></article>)}</div>}
    {visible.map(t=><article key={t.applicant.id} className={s.taskRow}><div><span className={s.badge}>{t.label}</span><h3>{t.applicant.nama}</h3><p>{t.applicant.asal_kampus} · Masuk {date(t.at)}</p></div><Link className={s.primary} href={staffHref('pengajuan')+'?id='+encodeURIComponent(t.applicant.id)}>Tindak lanjuti</Link></article>)}
    {!tasks.length&&<p className={s.empty}>Tidak ada tugas pemeriksaan saat ini. Pengajuan dan dokumen baru akan muncul di sini.</p>}
    <p className={s.caption}>Peserta yang masih memperbaiki berkas tidak masuk antrean petugas. Daftar tunggu ditinjau melalui menu penempatan.</p>
  </section>;
}
