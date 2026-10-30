import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseRevisionNotes,validateRevisionFiles,pendingTasks} from '../lib/preview-workflow';
import type {PreviewApplicant} from '../lib/preview-types';
test('catatan perbaikan dibatasi ke berkas yang dikenal dan harus terisi',()=>{
 assert.deepEqual(parseRevisionNotes({cv:'  Perjelas teks  ',surat:''}),{cv:'Perjelas teks'});
 for(const value of [{},{cv:' '},{laporan:'x'},{cv:123},{cv:'x'.repeat(1001)},null])assert.throws(()=>parseRevisionNotes(value));
});
test('semua berkas yang ditandai wajib diganti, berkas lain opsional',()=>{
 const f=new FormData();f.set('surat',new File(['x'],'surat.pdf'));
 assert.throws(()=>validateRevisionFiles({cv:'Kabur'},f));
 f.set('cv',new File(['x'],'cv.pdf'));
 assert.doesNotThrow(()=>validateRevisionFiles({cv:'Kabur'},f));
 assert.doesNotThrow(()=>validateRevisionFiles(undefined,f));
});
test('pusat tugas tidak memasukkan peserta yang masih memperbaiki dan mengurutkan waktu masuk',()=>{
 const base={id:'a',created:'2026-01-01',history:[]} as unknown as PreviewApplicant;
 const rows=[{...base,status:'perbaikan'},{...base,id:'b',status:'pending'},{...base,id:'c',status:'diperiksa',history:[{at:'2026-03-01',text:'Pendaftar mengirim berkas perbaikan'}]},{...base,id:'d',status:'diterima',completion:{state:'submitted',submittedAt:'2026-02-01',message:''}},{...base,id:'e',status:'diterima',completion:{state:'revision',submittedAt:'2026-02-01',message:''}}] as PreviewApplicant[];
 assert.deepEqual(pendingTasks(rows).map(t=>[t.applicant.id,t.kind]),[['b','baru'],['d','laporan'],['c','perbaikan']]);
});
