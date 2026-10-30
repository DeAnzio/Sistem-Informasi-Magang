import {hasValidOrigin} from '@/lib/request-origin';
import {portalDb,checked,trackingId,oneApplicant} from '@/lib/portal-data';
import {trackingCodeSchema,rateKey} from '@/lib/portal-security';
import {letterHTML} from '@/lib/portal-letter';
export const runtime='nodejs';
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  if(!hasValidOrigin(request)||!request.headers.get('origin'))return new Response('Asal permintaan tidak valid.',{status:403,headers});
  try{
    const db=portalDb();const ip=process.env.VERCEL?request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown':'local';
    const allowed=checked(await db.rpc('portal_batasi',{p_kunci:rateKey('letter:'+ip),p_limit:30,p_detik:600}));
    if(!allowed)return new Response('Terlalu banyak percobaan. Coba kembali beberapa menit lagi.',{status:429,headers});
    const form=await request.formData();const code=trackingCodeSchema.parse(form.get('code'));const id=await trackingId(db,code);
    if(!id)return new Response('Kode tidak ditemukan.',{status:404,headers});
    const p=await oneApplicant(db,id);
    if(!['diterima','selesai'].includes(p.status))return new Response('Draf belum tersedia.',{status:400,headers});
    return new Response(letterHTML(p),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
  }catch{return new Response('Draf belum dapat dimuat. Periksa kode atau coba kembali.',{status:400,headers});}
}
