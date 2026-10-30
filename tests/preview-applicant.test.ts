import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewApplicantFields,emailInUse} from '../lib/preview-applicant-schema';
import type {PreviewStatus} from '../lib/preview-types';
test('telepon 08 menerima 10–13 digit dan membersihkan spasi/tanda hubung',()=>{
 const phone=previewApplicantFields.shape.no_hp;
 assert.equal(phone.parse('0812-3456 7890'),'081234567890');
 for(const value of ['0812345678','0812345678901'])assert(phone.safeParse(value).success);
 for(const value of ['081234567','08123456789012','6281234567890','+6281234567890','0912345678','08abcdefgh',''])assert(!phone.safeParse(value).success);
});
test('email tidak membedakan kapital dan hanya unik pada pengajuan aktif',()=>{
 assert.equal(previewApplicantFields.shape.email.parse(' Nama@Example.test '),'nama@example.test');
 for(const status of ['pending','diperiksa','perbaikan','diterima','tunggu'] as PreviewStatus[])assert(emailInUse([{id:'1',email:' Nama@Example.test ',status}],'nama@example.test'));
 for(const status of ['ditolak','dibatalkan','selesai'] as PreviewStatus[])assert(!emailInUse([{id:'1',email:'nama@example.test',status}],'NAMA@example.test'));
 assert(!emailInUse([{id:'1',email:'nama@example.test',status:'pending'}],'nama@example.test','1'));
});
test('pengajuan baru tidak membutuhkan atau menyimpan NIM',()=>{
 const data={nama:'Peserta Contoh',email:'uji@example.test',no_hp:'081234567890',asal_kampus:'Kampus Uji',jurusan:'Informatika',tanggal_mulai:'2026-09-01',tanggal_selesai:'2026-10-01'};
 assert(previewApplicantFields.safeParse(data).success);
 assert(!('nim' in previewApplicantFields.parse({...data,nim:'12345'})));
});
