import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicCapacity} from '../lib/preview-capacity';
import {verifyPreviewCaptcha} from '../lib/preview-captcha';
import type {PreviewApplicant} from '../lib/preview-types';
test('kuota publik hanya agregat, tanggal inklusif, pending tidak dihitung',()=>{
 const settings={open:true,deadline:'',announcement:'',contact:'',divisions:[{name:'A',quota:2}]};
 const p={id:'private-id',nama:'private-name',divisi:'A',status:'diterima',tanggal_mulai:'2026-10-01',tanggal_selesai:'2026-10-29'} as PreviewApplicant;
 const result=publicCapacity(settings,[p,{...p,status:'pending'},{...p,tanggal_mulai:'2026-11-01',tanggal_selesai:'2026-12-01'}],'2026-10-29');
 assert.deepEqual(result,[{name:'A',quota:2,current:1,upcoming:1,remaining:1}]);
});
test('captcha preview menolak produksi, token kosong, hasil gagal dan gangguan jaringan',async()=>{
 const old={...process.env};const originalFetch=globalThis.fetch;
 try{
 process.env.LOCAL_PREVIEW='1';Object.assign(process.env,{NODE_ENV:'production'});delete process.env.VERCEL;
 await assert.rejects(verifyPreviewCaptcha('x'),/preview lokal/);
 Object.assign(process.env,{NODE_ENV:'development'});await assert.rejects(verifyPreviewCaptcha(''),/Centang/);
 globalThis.fetch=async()=>new Response(JSON.stringify({success:false}));await assert.rejects(verifyPreviewCaptcha('x'),/gagal/);
 globalThis.fetch=async()=>{throw Error('network');};await assert.rejects(verifyPreviewCaptcha('x'),/koneksi/);
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true}));await verifyPreviewCaptcha('x');
 }finally{globalThis.fetch=originalFetch;for(const key of ['LOCAL_PREVIEW','NODE_ENV','VERCEL']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
