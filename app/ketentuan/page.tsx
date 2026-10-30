import {Suspense} from 'react';
import Portal from '@/components/portal/preview-client';
export default function Page(){return <Suspense fallback={<p role='status'>Memuat layanan…</p>}><Portal/></Suspense>;}
