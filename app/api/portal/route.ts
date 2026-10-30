import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {portalDb,checked,required,settings,allApplicants,oneApplicant,publicApplicant,trackingId,type PortalClient} from '@/lib/portal-data';
import {trackingCodeSchema,newTrackingCode,hashCode,uploadTicket,verifyUploadTicket,rateKey,publicError} from '@/lib/portal-security';
import {getAuthenticatedAdminId} from '@/lib/supabase/authorize-admin';
import {createSupabaseServerClient} from '@/lib/supabase/server';
import {hasValidOrigin} from '@/lib/request-origin';
import {verifyRegistrationRecaptcha} from '@/lib/recaptcha';
import {previewApplicantSchema} from '@/lib/preview-applicant-schema';
import {acceptedFileTypes,fileMetadataSchema} from '@/lib/applicant-schema';
import {parseRevisionNotes} from '@/lib/preview-workflow';
import type {Json} from '@/lib/database.types';
import {letterHTML} from '@/lib/portal-letter';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
class RequestError extends Error{constructor(message:string,public status=400){super(message);}}
const uuid=z.uuid();
const fileSchema=fileMetadataSchema.extend({kind:z.enum(['cv','surat','laporan']),name:z.string().min(1).max(255)});
const settingsSchema=z.object({open:z.boolean(),deadline:z.union([z.literal(''),z.iso.date()]),announcement:z.string().max(1000),contact:z.string().max(500),
  divisions:z.array(z.object({name:z.string().min(1),quota:z.number().int().min(0).max(500)})).min(1)});
async function rate(db:PortalClient,r:Request,action:string,limit=60,seconds=600){
  const ip=process.env.VERCEL?r.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown':'local';
  const allowed=checked(await db.rpc('portal_batasi',{p_kunci:rateKey(action+':'+ip),p_limit:limit,p_detik:seconds}));
  if(!allowed)throw new RequestError('Terlalu banyak percobaan. Tunggu beberapa menit lalu coba kembali.',429);
}
async function tracked(db:PortalClient,raw:unknown){const code=trackingCodeSchema.parse(raw);const id=await trackingId(db,code);
  if(!id)throw new RequestError('Kode tidak ditemukan atau sudah tidak berlaku.',404);return {id,code};}
async function receipt(db:PortalClient,id:string,code:string){return {applicant:publicApplicant(await oneApplicant(db,id),code)};}

export async function GET(request:NextRequest){
  try{
    const db=portalDb();const q=request.nextUrl.searchParams;
    const admin=await getAuthenticatedAdminId();
    if(q.has('file')){
      if(!admin)throw new RequestError('Silakan masuk sebagai petugas.',401);
      const id=q.get('file')!;let path:string,name:string;
      if(id.startsWith('legacy:')){
        const parts=id.split(':');if(parts.length!==3||!['cv','surat'].includes(parts[2]))throw new RequestError('Berkas tidak valid.');
        const a=required(await db.from('applicants').select('berkas_cv,berkas_surat_pengantar').eq('id',uuid.parse(parts[1])).single());
        const p=parts[2]==='cv'?a.berkas_cv:a.berkas_surat_pengantar;if(!p)throw new RequestError('Berkas tidak ditemukan.',404);
        path=p;name=p.split('/').pop()||'dokumen';
      }else{
        const d=required(await db.from('dokumen_pendaftar').select('storage_path,nama_asli').eq('id',uuid.parse(id)).single());path=d.storage_path;name=d.nama_asli;
      }
      const link=required(await db.storage.from('berkas').createSignedUrl(path,60,{download:q.get('inline')==='1'?false:name}));
      return NextResponse.redirect(link.signedUrl,{status:303,headers});
    }
    if(q.has('letter')){
      if(!admin)throw new RequestError('Silakan masuk sebagai petugas.',401);
      const p=await oneApplicant(db,uuid.parse(q.get('letter')));
      if(!['diterima','selesai'].includes(p.status))throw new RequestError('Draf tersedia setelah pengajuan diterima.');
      return new Response(letterHTML(p),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
    }
    const cfg=await settings(db);const slots=required(await db.rpc('get_slot_info',{}));
    return json({settings:cfg,capacity:slots.map(s=>({name:s.divisi_nama,quota:s.kuota,current:s.terisi,upcoming:s.terjadwal,remaining:s.sisa})),
      admin:!!admin,applicants:admin?await allApplicants(db):undefined});
  }catch(e){return failure(e);}
}

function failure(e:unknown){
  if(e instanceof RequestError)return json({error:e.message},e.status);
  if(e instanceof z.ZodError)return json({error:e.issues.map(i=>i.message).join(' ')},400);
  // Jangan mengirim detail SQL, tiket, token atau konfigurasi ke browser/log.
  return json({error:publicError(e)},400);
}
export async function POST(request:NextRequest){
  if(!hasValidOrigin(request)||!request.headers.get('origin'))return json({error:'Asal permintaan tidak valid.'},403);
  try{
    const text=await request.text();if(text.length>65536)throw new RequestError('Permintaan terlalu besar.',413);
    let body:Record<string,unknown>;
    try{body=z.record(z.string(),z.unknown()).parse(JSON.parse(text));}catch{throw new RequestError('Permintaan tidak valid.');}
    const action=z.string().parse(body.action);const db=portalDb();
    if(action==='login'){
      await rate(db,request,'login',15,900);
      const email=z.email().parse(body.email),password=z.string().min(1).max(200).parse(body.password);
      const auth=await createSupabaseServerClient();const result=await auth.auth.signInWithPassword({email,password});
      if(result.error||!await getAuthenticatedAdminId()){await auth.auth.signOut();throw new RequestError('Email atau kata sandi tidak sesuai, atau akun tidak memiliki akses petugas.',401);}
      return json({ok:true});
    }
    if(action==='logout'){const auth=await createSupabaseServerClient();await auth.auth.signOut();return json({ok:true});}
    if(action==='track'){
      await rate(db,request,'track');const {id,code}=await tracked(db,body.code);return json(await receipt(db,id,code));
    }
    if(action==='prepare'){
      await rate(db,request,'upload',20,600);
      const operation=z.enum(['register','revise','final-report']).parse(body.operation);
      const files=z.array(fileSchema).min(1).max(2).parse(body.files);
      if(new Set(files.map(f=>f.kind)).size!==files.length)throw new RequestError('Jenis dokumen ganda.');
      if(operation==='final-report'?(files.length!==1||files[0].kind!=='laporan'||files[0].type!=='application/pdf'):files.some(f=>f.kind==='laporan'))throw new RequestError('Jenis dokumen tidak sesuai.');
      let id:string,code:string;let applicant:Json={};
      if(operation==='register'){
        // Origin sudah diverifikasi same-origin di awal handler. Gunakan hostname
        // browser karena Next dapat menormalkan 127.0.0.1 menjadi localhost.
        const captcha=await verifyRegistrationRecaptcha(z.string().min(1).max(4096).parse(body.recaptchaToken),new URL(request.headers.get('origin')!).hostname);
        if(!captcha.ok)throw new RequestError('Verifikasi Saya bukan robot gagal atau belum dikonfigurasi. Muat ulang dan coba kembali.',403);
        const cfg=await settings(db);const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Jakarta'});
        if(!cfg.open||(cfg.deadline&&cfg.deadline<today))throw new RequestError('Pendaftaran sedang ditutup.');
        if(!files.some(f=>f.kind==='cv')||!files.some(f=>f.kind==='surat'))throw new RequestError('CV dan surat pengantar wajib dilampirkan.');
        applicant=previewApplicantSchema.parse(body);id=randomUUID();code=newTrackingCode();
      }else{
        ({id,code}=await tracked(db,body.code));
        const a=await oneApplicant(db,id);
        if(operation==='revise'){
          if(a.status!=='perbaikan')throw new RequestError('Pengajuan tidak sedang menunggu perbaikan.');
          for(const kind of Object.keys(a.revisionNotes||{}))if(!files.some(f=>f.kind===kind))throw new RequestError('Unggah seluruh dokumen yang diminta untuk diperbaiki.');
        }else if(a.status!=='diterima'||(a.completion&&a.completion.state!=='revision'))throw new RequestError('Laporan belum dapat dikirim pada status ini.');
      }
      const sessionId=randomUUID(),expires=Date.now()+15*60*1000;
      const metadata=files.map(f=>({...f,path:`${id}/${sessionId}/${f.kind}.${acceptedFileTypes.get(f.type)}`}));
      checked(await db.from('portal_sesi_unggahan').insert({id:sessionId,applicant_id:id,aksi:operation,
        payload:{applicant,token_hash:hashCode(code),files:metadata},expires_at:new Date(expires).toISOString()}));
      const uploads=[];
      for(const f of metadata){const link=required(await db.storage.from('berkas').createSignedUploadUrl(f.path));uploads.push({kind:f.kind,path:f.path,token:link.token});}
      return json({ticket:uploadTicket(sessionId,code,expires),code,uploads});
    }
    if(action==='recover-upload'){
      await rate(db,request,'finalize',40,600);
      const ticket=verifyUploadTicket(z.string().max(4096).parse(body.ticket),true);
      if(!ticket)throw new RequestError('Sesi unggahan tidak valid.');
      const session=required(await db.from('portal_sesi_unggahan').select('status,applicant_id').eq('id',ticket.id).single());
      if(session.status==='tersimpan')return json(await receipt(db,session.applicant_id,ticket.code));
      if(ticket.expires>Date.now())throw new RequestError('Pengiriman belum terkonfirmasi. Coba kembali.');
      const cancelled=checked(await db.rpc('portal_batalkan_sesi',{p_sesi:ticket.id}));
      // Jika finalisasi menang lebih dahulu, berikan bukti yang sudah tersimpan.
      if(!cancelled)return json(await receipt(db,session.applicant_id,ticket.code));
      return json({restart:true});
    }
    if(action==='finalize'){
      await rate(db,request,'finalize',40,600);
      const ticket=verifyUploadTicket(z.string().max(4096).parse(body.ticket));if(!ticket)throw new RequestError('Sesi unggahan kedaluwarsa. Silakan mulai kembali.');
      const id=required(await db.rpc('portal_finalisasi_unggahan',{p_sesi:ticket.id}));
      return json(await receipt(db,id,ticket.code));
    }
    if(action==='survey'){
      await rate(db,request,'survey',20,600);const {id,code}=await tracked(db,body.code);
      const scores=z.array(z.number().int().min(1).max(5)).length(4).parse(JSON.parse(String(body.scores)));
      checked(await db.rpc('portal_simpan_survei',{p_id:id,p_scores:scores,p_komentar:z.string().trim().max(1000).parse(body.comment||'')}));
      return json(await receipt(db,id,code));
    }
    const admin=await getAuthenticatedAdminId();if(!admin)throw new RequestError('Silakan masuk sebagai petugas.',401);
    if(action==='rotate-code'){
      const code=newTrackingCode();checked(await db.rpc('portal_terbitkan_kode',{p_id:uuid.parse(body.id),p_admin:admin,p_hash:hashCode(code)}));
      return json({code});
    }else if(action==='manual'){
      const fields=previewApplicantSchema.parse(body);const code=newTrackingCode();
      const id=required(await db.rpc('portal_input_manual',{p_admin:admin,p_applicant:fields,p_divisi:null,p_hash:hashCode(code)}));
      return json({id,code});
    }else if(action==='review'){
      const review=z.object({identity:z.boolean(),cv:z.boolean(),surat:z.boolean(),schedule:z.boolean()}).parse(JSON.parse(String(body.review)));
      checked(await db.rpc('portal_simpan_pemeriksaan',{p_id:uuid.parse(body.id),p_admin:admin,p_review:review}));
    }else if(action==='decision'){
      const status=z.enum(['pending','perbaikan','diterima','ditolak','dibatalkan','tunggu']).parse(body.status);
      let division:string|null=null;
      if(body.division){const d=required(await db.from('divisi').select('id').eq('nama',z.string().parse(body.division)).eq('aktif',true).single());division=d.id;}
      const notes=status==='perbaikan'?parseRevisionNotes(JSON.parse(String(body.revisionNotes||'{}'))):{};
      checked(await db.rpc('portal_putuskan',{p_id:uuid.parse(body.id),p_admin:admin,p_status:status,p_divisi:division,
        p_pesan:z.string().trim().max(1000).parse(body.message||''),p_catatan:notes}));
    }else if(action==='complete'){
      checked(await db.rpc('portal_periksa_laporan',{p_id:uuid.parse(body.id),p_admin:admin,
        p_setujui:z.enum(['approve','revision']).parse(body.choice)==='approve',p_pesan:z.string().trim().min(1).max(1000).parse(body.message)}));
    }else if(action==='settings'){
      const input=settingsSchema.parse(JSON.parse(String(body.settings)));
      if(new Set(input.divisions.map(d=>d.name)).size!==input.divisions.length)throw new RequestError('Divisi ganda.');
      checked(await db.rpc('portal_simpan_pengaturan',{p_admin:admin,p_settings:input}));
    }else if(action==='schedule'){
      const start=z.iso.date().parse(body.start),end=z.iso.date().parse(body.end);
      const result=checked(await db.rpc('ubah_jadwal_pemagang',{p_id:uuid.parse(body.id),p_admin:admin,p_mulai:start,p_selesai:end}));
      if(result!=='ok')throw {message:result};
    }else throw new RequestError('Tindakan tidak tersedia.');
    return json({ok:true});
  }catch(e){return failure(e);}
}
