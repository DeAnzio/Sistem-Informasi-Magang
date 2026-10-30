import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

export const trackingCodeSchema=z.string().trim().toUpperCase().regex(/^MG-[A-F0-9]{48}$/,'Kode pelacakan tidak valid.');
export const hashCode=(code:string)=>createHash('sha256').update(code).digest('hex');
export const newTrackingCode=()=>'MG-'+randomBytes(24).toString('hex').toUpperCase();
const ticketSchema=z.object({id:z.uuid(),code:trackingCodeSchema,expires:z.number().int()});
function secret(){const v=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!v)throw Error('Konfigurasi server belum tersedia.');return v;}
function signature(value:string){return createHmac('sha256',secret()).update('portal-upload:'+value).digest('base64url');}
export function uploadTicket(id:string,code:string,expires:number){const body=Buffer.from(JSON.stringify({id,code,expires})).toString('base64url');return body+'.'+signature(body);}
export function verifyUploadTicket(ticket:string,allowExpired=false){
  const [body,sig,extra]=ticket.split('.');if(!body||!sig||extra)return null;
  const expected=Buffer.from(signature(body)),given=Buffer.from(sig);
  if(expected.length!==given.length||!timingSafeEqual(expected,given))return null;
  try{const result=ticketSchema.parse(JSON.parse(Buffer.from(body,'base64url').toString()));return allowExpired||result.expires>Date.now()?result:null;}catch{return null;}
}
export function rateKey(value:string){return createHmac('sha256',secret()).update('portal-rate:'+value).digest('hex');}

export function publicError(error:unknown){
  const e=error as {code?:string;message?:string};
  if(e.code==='23505')return 'Data sudah tersimpan atau email masih memiliki pengajuan aktif. Periksa kembali status pengajuan.';
  const messages:Record<string,string>={
    pendaftaran_ditutup:'Pendaftaran sedang ditutup.',kuota_penuh:'Kuota divisi penuh pada periode ini.',
    kuota_masih_tersedia:'Kuota masih tersedia. Gunakan keputusan penerimaan.',
    kuota_kurang_dari_terisi:'Kuota tidak boleh lebih kecil dari kebutuhan peserta.',
    pemeriksaan_belum_lengkap:'Simpan seluruh daftar pemeriksaan sebelum menerima peserta.',
    status_tidak_valid:'Perubahan status tersebut tidak tersedia pada tahap ini.',
    pesan_wajib_diisi:'Isi pesan untuk pendaftar.',catatan_perbaikan_wajib:'Isi catatan perbaikan CV atau surat pengantar.',
    berkas_perbaikan_belum_lengkap:'Unggah semua berkas yang diminta untuk diperbaiki.',
    periode_belum_selesai:'Magang belum dapat diselesaikan sebelum tanggal akhirnya.',
    berkas_storage_tidak_valid:'Berkas belum lengkap atau tidak sesuai. Unggah ulang berkas.',
    tiket_tidak_valid:'Sesi unggahan kedaluwarsa. Silakan mulai kembali.',
    status_laporan_tidak_valid:'Laporan sedang diperiksa atau status peserta tidak sesuai.',
    status_perbaikan_tidak_valid:'Pengajuan tidak sedang menunggu perbaikan.',
  };
  return messages[e.message||'']||'Permintaan belum dapat diproses. Muat ulang data lalu coba kembali.';
}
