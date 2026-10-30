import {Suspense} from 'react';
import {notFound} from 'next/navigation';
import {staffPages} from '@/lib/portal-workflow';
import Portal from '@/components/portal/preview-client';
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!Object.hasOwn(staffPages,section))notFound();return <Suspense fallback={<p role='status'>Memuat ruang petugas…</p>}><Portal/></Suspense>;}
