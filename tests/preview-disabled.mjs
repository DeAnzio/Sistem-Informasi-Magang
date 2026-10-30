import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3003'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,LOCAL_PREVIEW:'1'}});
try { await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server produksi tidak siap')),20000);server.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready')){clearTimeout(timer);resolve();}});server.once('exit',()=>{clearTimeout(timer);reject(Error('Server berhenti'));});});
for(const route of ['/preview','/preview/admin','/api/preview'])assert.equal((await fetch('http://127.0.0.1:3003'+route)).status,404);
console.log('LULUS: halaman dan API uji lokal tertutup pada mode produksi meskipun LOCAL_PREVIEW=1.');
}finally{server.kill();}
