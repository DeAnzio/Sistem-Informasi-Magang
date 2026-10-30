// Jalankan manual: node --env-file=.env.local --import tsx scripts/cleanup-portal-uploads.ts
// Default hanya melaporkan jumlah. Tambahkan --apply untuk menghapus objek sementara.
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import type {PortalDatabase} from '../lib/portal-database';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Konfigurasi Supabase belum tersedia.');
const db=createClient<PortalDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const apply=process.argv.includes('--apply');
// Signed upload URL berlaku lebih lama dari tiket aplikasi. Tunggu tambahan tiga jam.
const {data,error}=await db.from('portal_sesi_unggahan').select('id,applicant_id,payload')
  .neq('status','tersimpan').lt('expires_at',new Date(Date.now()-3*60*60*1000).toISOString()).order('expires_at').limit(100);
if(error)throw Error('Daftar unggahan sementara belum dapat dibaca.');
console.log(`${data.length} sesi kedaluwarsa ditemukan; mode ${apply?'hapus':'baca-saja'}.`);
if(apply)for(const session of data){
  const payload=z.object({files:z.array(z.object({path:z.string()}))}).parse(session.payload);
  const paths=payload.files.map(f=>f.path);
  if(paths.some(p=>!p.startsWith(`${session.applicant_id}/${session.id}/`)))throw Error('Jalur objek di luar sesi; pembersihan dihentikan.');
  const cancelled=await db.rpc('portal_batalkan_sesi',{p_sesi:session.id});
  if(cancelled.error)throw Error('Sesi belum dapat dikunci.');
  if(!cancelled.data)continue;
  const removed=await db.storage.from('berkas').remove(paths);if(removed.error)throw Error('Objek belum dapat dibersihkan; ulangi pembersihan nanti.');
  const deleted=await db.from('portal_sesi_unggahan').delete().eq('id',session.id).eq('status','dibatalkan');
  if(deleted.error)throw Error('Catatan sesi belum dapat dibersihkan.');
}
