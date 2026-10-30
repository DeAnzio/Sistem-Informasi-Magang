// Build dan uji handler Next dengan backend HTTP lokal; tidak mengakses Supabase nyata.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const admin='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',div='00000000-0000-4000-8000-000000000003';
const code='MG-'+'A'.repeat(48);const calls=[];
let limited=false;
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const user={id:admin,aud:'authenticated',role:'authenticated',email:'admin@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const applicant={id,nama:'Peserta Uji',email:'private@example.com',no_hp:'08123456789',asal_kampus:'Kampus',jurusan:'Jurusan',nim:null,
  divisi_id:div,tanggal_mulai:'2030-01-01',tanggal_selesai:'2030-02-01',status:'pending',sumber:'online',created_at:new Date().toISOString(),
  berkas_cv:null,berkas_surat_pengantar:null,pesan_pendaftar:'Menunggu pemeriksaan',pemeriksaan:{identity:false,cv:false,surat:false,schedule:false},
  catatan_perbaikan:{},catatan_admin:'INTERNAL_ONLY',perbaikan_diminta_at:null,daftar_tunggu_at:null};
const backend=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let raw='';for await(const chunk of req)raw+=chunk;
  let body;try{body=JSON.parse(raw);}catch{body={};}
  calls.push({path:url.pathname,body});let result=[];
  if(url.pathname==='/__recaptcha')result={success:!raw.includes('reject-captcha'),hostname:'127.0.0.1'};
  else if(url.pathname==='/auth/v1/token'){
    const now=Math.floor(Date.now()/1000);
    result={access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:admin,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})}.local`,refresh_token:'refresh-local',token_type:'bearer',expires_in:3600,expires_at:now+3600,user};
  }
  else if(url.pathname==='/auth/v1/logout')result=null;
  else if(url.pathname==='/auth/v1/user')result=user;
  else if(url.pathname==='/rest/v1/admins')result=[{user_id:admin}];
  else if(url.pathname==='/rest/v1/divisi')result=[{id:div,nama:'Divisi Uji',urutan:1,kuota:5,aktif:true}];
  else if(url.pathname==='/rest/v1/pengaturan_layanan')result=[{id:true,pendaftaran_dibuka:true,batas_pendaftaran:null,pengumuman:'Layanan uji',kontak:'Kontak uji'}];
  else if(url.pathname==='/rest/v1/rpc/get_slot_info')result=[{divisi_id:div,divisi_nama:'Divisi Uji',kuota:5,terisi:0,terjadwal:0,sisa:5}];
  else if(url.pathname==='/rest/v1/rpc/portal_batasi')result=!limited;
  else if(url.pathname==='/rest/v1/akses_pelacakan')result=[{applicant_id:id}];
  else if(url.pathname==='/rest/v1/applicants'){result=[applicant];res.setHeader('Content-Range','0-0/1');}
  else if(url.pathname==='/rest/v1/dokumen_pendaftar'||url.pathname==='/rest/v1/penyelesaian_magang'||url.pathname==='/rest/v1/survei_magang')result=[];
  else if(url.pathname==='/rest/v1/aktivitas_pendaftar'){result=[{aksi:'portal_daftar',waktu:applicant.created_at}];res.setHeader('Content-Range','0-0/1');}
  else if(url.pathname==='/rest/v1/portal_sesi_unggahan')result=null;
  else if(url.pathname.startsWith('/storage/v1/object/upload/sign/'))result={url:'/object/upload/sign/berkas/example?token=test-upload-token'};
  else if(url.pathname==='/rest/v1/rpc/portal_finalisasi_unggahan')result=id;
  else if(url.pathname.startsWith('/rest/v1/rpc/portal_'))result=null;
  else {res.statusCode=500;result={message:'UNEXPECTED_LOCAL_PATH'};}
  if(Array.isArray(result)&&req.headers.accept?.includes('application/vnd.pgrst.object+json'))result=result[0]||null;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const backendUrl=`http://127.0.0.1:${backend.address().port}`;
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const env={...process.env,PORTAL_TEST_BUILD:'1',NEXT_PUBLIC_SUPABASE_URL:backendUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-anon',
  SUPABASE_SERVICE_ROLE_KEY:'local-service',RECAPTCHA_SECRET_KEY:'local-secret',NEXT_PUBLIC_RECAPTCHA_SITE_KEY:'local-site',
  LOCAL_TEST_BACKEND_ORIGIN:backendUrl,NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(env))if(key.startsWith('SMTP_'))delete env[key];
delete env.LOCAL_PREVIEW;delete env.LOCAL_PREVIEW_SESSION;delete env.LOCAL_PREVIEW_PIN;
const preload=fileURLToPath(new URL('./portal-backend-only.cjs',import.meta.url));let server;
try{
  await new Promise((resolve,reject)=>{
    const build=spawn(process.execPath,['--require',preload,'node_modules/next/dist/bin/next','build','--webpack'],{env,stdio:['ignore','pipe','pipe']});
    let log='';build.stdout.on('data',s=>log+=s);build.stderr.on('data',s=>log+=s);
    build.on('error',reject);build.on('exit',n=>n===0?resolve():reject(Error('Build uji gagal: '+log.slice(-6000))));
  });
  console.log('Build produksi terisolasi lulus.');
  server=spawn(process.execPath,['--require',preload,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server belum siap')),30000);
    server.on('error',reject);server.stdout.on('data',s=>{if(s.toString().includes('Ready')){clearTimeout(timeout);resolve();}});});
  const base=`http://127.0.0.1:${port}`,now=Math.floor(Date.now()/1000);
  const access=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:admin,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})}.local`;
  const cookie=`sb-127-auth-token=base64-${encode({access_token:access,refresh_token:'local-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user})}`;
  const post=(body,adminSession=false,origin=base)=>fetch(base+'/api/portal',{method:'POST',headers:{origin,'Content-Type':'application/json',...(adminSession?{cookie}:{})},body:JSON.stringify(body)});
  const publicResponse=await fetch(base+'/api/portal');assert.equal(publicResponse.status,200);
  const publicBody=await publicResponse.json();assert.equal(publicBody.admin,false);assert.equal(publicBody.applicants,undefined);
  assert.ok(!JSON.stringify(publicBody).includes('private@example.com'));
  const login=await post({action:'login',email:'admin@example.com',password:'test-password'});
  assert.equal(login.status,200,await login.clone().text());assert.ok(login.headers.get('set-cookie'));
  const tracked=await post({action:'track',code});assert.equal(tracked.status,200,await tracked.clone().text());
  const trackedBody=await tracked.json();assert.equal(trackedBody.applicant.email,undefined);assert.equal(trackedBody.applicant.id,undefined);
  assert.ok(!JSON.stringify(trackedBody).includes('INTERNAL_ONLY'));
  assert.equal((await post({action:'decision',id,status:'diterima'})).status,401);
  assert.equal((await post({action:'track',code},false,'https://untrusted.example')).status,403);
  limited=true;assert.equal((await post({action:'track',code})).status,429);limited=false;
  const response=await post({action:'review',id,review:JSON.stringify({identity:true,cv:true,surat:true,schedule:true})},true);
  assert.equal(response.status,200,await response.clone().text());
  assert.equal(calls.find(c=>c.path.endsWith('/portal_simpan_pemeriksaan')).body.p_admin,admin);
  const prepared=await post({action:'prepare',operation:'register',nama:'Peserta Baru',email:'new@example.com',no_hp:'08123456789',asal_kampus:'Kampus',jurusan:'Jurusan',
    tanggal_mulai:'2030-01-01',tanggal_selesai:'2030-02-01',recaptchaToken:'mock-captcha',files:['cv','surat'].map(kind=>({kind,name:kind+'.pdf',type:'application/pdf',size:100}))});
  assert.equal(prepared.status,200,await prepared.clone().text());const upload=await prepared.json();assert.equal(upload.uploads.length,2);
  assert.equal((await post({action:'finalize',ticket:upload.ticket})).status,200);
  assert.equal((await post({action:'finalize',ticket:upload.ticket+'tampered'})).status,400);
  const exported=await fetch(base+'/api/export?format=csv',{headers:{cookie}});
  assert.equal(exported.status,200,await exported.clone().text());assert.ok(!(await exported.text()).includes(';NIM;'));
  for(const path of ['/api/daftar','/api/daftar/upload','/api/pemagang/manual'])assert.equal((await fetch(base+path,{method:'POST'})).status,409);
  for(const path of ['/','/daftar','/lacak','/kontak','/admin/login'])assert.equal((await fetch(base+path)).status,200);
  assert.equal((await fetch(base+'/preview')).status,404);
  assert.ok(!calls.some(c=>c.path.includes('email_logs')));
  console.log('HTTP portal lulus: pemisahan data publik/admin, CSRF, unggahan bertiket, identitas admin, kontrak lama, halaman publik, preview nonaktif.');
}finally{server?.kill();backend.closeAllConnections();await new Promise(resolve=>backend.close(resolve));}
