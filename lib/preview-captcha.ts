// Google public test key: only usable by the isolated development preview.
export async function verifyPreviewCaptcha(token:string){
 if(process.env.LOCAL_PREVIEW!=='1'||process.env.NODE_ENV!=='development'||process.env.VERCEL)throw Error('reCAPTCHA uji hanya tersedia di preview lokal.');
 if(!token.trim())throw Error('Centang Saya bukan robot sebelum mengirim pengajuan.');
 let result;
 try{const r=await fetch('https://www.google.com/recaptcha/api/siteverify',{method:'POST',body:new URLSearchParams({secret:'6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',response:token}),cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();result=await r.json();}catch{throw Error('Verifikasi reCAPTCHA tidak dapat dihubungi. Periksa koneksi lalu coba kembali.');}
 if(result.success!==true)throw Error('Verifikasi reCAPTCHA gagal atau kedaluwarsa. Centang ulang Saya bukan robot.');
}
