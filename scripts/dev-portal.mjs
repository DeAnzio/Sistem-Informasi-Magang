import {spawn} from 'node:child_process';
console.log('Portal Supabase: http://127.0.0.1:3002 — konfigurasi .env.local. Pengiriman formulir memakai database yang sama dengan website.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3002'],{
  stdio:'inherit',env:{...process.env,PORTAL_LOCAL_BUILD:'1',PORTAL_TEST_BUILD:'0',LOCAL_PREVIEW:'0',LOCAL_PREVIEW_SESSION:'',LOCAL_PREVIEW_PIN:''},
});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
