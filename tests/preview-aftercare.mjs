import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001';let cookie='';
async function send(action,values={},files={}){const f=new FormData();f.set('action',action);if(action==='register')f.set('recaptchaToken','local-test-token');for(const [k,v] of Object.entries(values))f.set(k,v);for(const [k,v] of Object.entries(files))f.set(k,new File([v],k+'.pdf',{type:'application/pdf'}));const r=await fetch(base+'/api/preview',{method:'POST',headers:{Origin:base,...(cookie?{Cookie:cookie}:{})},body:f});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
const read=async()=>await(await fetch(base+'/api/preview',{headers:{Cookie:cookie}})).json();
assert(process.env.LOCAL_TEST_PIN);assert.equal((await send('login',{pin:process.env.LOCAL_TEST_PIN})).status,200);
const original=await read();const settings={...original.settings,open:true,deadline:'',divisions:original.settings.divisions.map((d,i)=>({...d,quota:i===0?1:d.quota}))};const division=settings.divisions[0].name;
const year=Math.min(2020,...original.applicants.map(p=>Number(p.tanggal_mulai.slice(0,4))))-1;const future=Math.max(2030,...original.applicants.map(p=>Number(p.tanggal_selesai.slice(0,4))))+1;
const review=JSON.stringify({identity:true,cv:true,surat:true,schedule:true});
async function register(offset,y=year){const r=await send('register',{nama:'Uji Penyelesaian '+offset,email:`contoh-${Date.now()}-${offset}@example.test`,no_hp:'081234567890',asal_kampus:'Kampus Uji',jurusan:'Informatika',nim:String(Date.now()+offset).slice(-12),tanggal_mulai:`${y}-01-01`,tanggal_selesai:`${y}-02-01`},{cv:'%PDF-1.4 uji',surat:'%PDF-1.4 uji'});assert.equal(r.status,200);const code=r.data.applicant.code;const db=await read();const p=db.applicants.find(p=>p.code===code);assert.equal((await send('review',{id:p.id,review})).status,200);return p;}
try{assert.equal((await send('settings',{settings:JSON.stringify(settings)})).status,200);
const a=await register(1),b=await register(2);
assert.equal((await send('decision',{id:a.id,status:'tunggu',division,message:'Kuota penuh'})).status,400,'tidak boleh masuk tunggu bila kuota tersedia');
assert.equal((await send('decision',{id:a.id,status:'diterima',division,message:'Diterima'})).status,200);
assert.equal((await send('decision',{id:b.id,status:'tunggu',division,message:'Menunggu tempat sesuai jadwal'})).status,200);
assert((await read()).applicants.find(p=>p.id===b.id).waitlistedAt);
assert.equal((await send('decision',{id:b.id,status:'diterima',division})).status,400,'tunggu tidak boleh melampaui kapasitas');
assert.equal((await send('decision',{id:a.id,status:'dibatalkan',division,message:'Pembatalan contoh uji'})).status,200);
assert.equal((await send('decision',{id:b.id,status:'diterima',division,message:'Tempat kini tersedia'})).status,200);
assert.equal((await send('complete',{id:b.id,choice:'approve',message:'Selesai'})).status,400,'tidak selesai tanpa laporan');
cookie='';assert.equal((await send('survey',{code:b.code,scores:'[5,5,5,5]'})).status,400);
assert.equal((await send('final-report',{code:'SALAH'},{laporan:'%PDF-1.4 uji'})).status,400);
assert.equal((await send('final-report',{code:b.code},{laporan:'%PDF-1.4 laporan'})).status,200);
assert.equal((await send('final-report',{code:b.code},{laporan:'%PDF-1.4 laporan'})).status,400);
assert.equal((await send('complete',{id:b.id,choice:'approve',message:'Selesai'})).status,401);
assert.equal((await send('login',{pin:process.env.LOCAL_TEST_PIN})).status,200);
assert.equal((await send('complete',{id:b.id,choice:'revision',message:'Lengkapi simpulan laporan.'})).status,200);
cookie='';const revised=await send('final-report',{code:b.code},{laporan:'%PDF-1.4 revisi'});assert.equal(revised.status,200);assert.equal(revised.data.applicant.files.filter(f=>f.kind==='laporan').at(-1).version,2);
assert.equal((await send('login',{pin:process.env.LOCAL_TEST_PIN})).status,200);
assert.equal((await send('complete',{id:b.id,choice:'approve',message:'Laporan sesuai, magang selesai.'})).status,200);
assert.equal((await send('decision',{id:b.id,status:'pending'})).status,400);
cookie='';assert.equal((await send('survey',{code:b.code,scores:'[6,5,5,5]'})).status,400);
const survey=await send('survey',{code:b.code,scores:'[4,5,4,5]',comment:'Alur jelas.'});assert.equal(survey.status,200);assert.equal(survey.data.applicant.surveySubmitted,true);assert.equal(survey.data.applicant.survey,undefined);
assert.equal((await send('survey',{code:b.code,scores:'[1,1,1,1]'})).status,400);assert.equal((await fetch(base+'/api/preview?letter='+b.code)).status,200);
assert.equal((await send('login',{pin:process.env.LOCAL_TEST_PIN})).status,200);const db=await read();assert.deepEqual(db.applicants.find(p=>p.id===b.id).survey.scores,[4,5,4,5]);
const c=await register(3,future);assert.equal((await send('decision',{id:c.id,status:'diterima',division,message:'Uji tanggal'})).status,200);
assert.equal((await send('final-report',{code:c.code},{laporan:'%PDF-1.4 laporan'})).status,200);assert.equal((await send('complete',{id:c.id,choice:'approve',message:'Uji sebelum akhir'})).status,400);
console.log('LULUS: daftar tunggu dan promosi setelah pembatalan, laporan akhir versi 2, otorisasi penyelesaian, batas tanggal akhir, survei satu kali, privasi hasil publik, serta draf untuk peserta selesai. Data contoh hanya lokal.');
}finally{await send('settings',{settings:JSON.stringify(original.settings)});}
