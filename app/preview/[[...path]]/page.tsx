export const metadata={title:'Layanan Magang | Kantor Pertanahan Kota Yogyakarta'};
import { staffPages } from '@/lib/preview-workflow';
import { notFound } from 'next/navigation';
import Preview from '../preview-client';
export const dynamic = 'force-dynamic';
export default async function Page({params}: {params: Promise<{path?:string[]}>}) { if (process.env.LOCAL_PREVIEW !== '1' || process.env.NODE_ENV !== 'development' || process.env.VERCEL) notFound(); const {path=[]}=await params; const publicPage=path.length<=1&&['','daftar','lacak','informasi','ketentuan','slot','kontak','survey','admin'].includes(path.join('/')); const staffPage=path.length===2&&path[0]==='admin'&&Object.hasOwn(staffPages,path[1]); if(!publicPage&&!staffPage)notFound(); return <Preview key={path.join('/')} />; }
