import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newTrackingCode,hashCode,trackingCodeSchema,uploadTicket,verifyUploadTicket,publicError} from '../lib/portal-security';
test('kode portal acak, hash konsisten, dan tiket tahan perubahan serta kedaluwarsa',()=>{
  const old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-key';
  try{
    const code=newTrackingCode();assert.ok(trackingCodeSchema.safeParse(code).success);
    assert.notEqual(code,newTrackingCode());assert.equal(hashCode(code).length,64);
    const id='00000000-0000-4000-8000-000000000001';
    const ticket=uploadTicket(id,code,Date.now()+60000);
    assert.equal(verifyUploadTicket(ticket)?.code,code);
    assert.equal(verifyUploadTicket(ticket+'x'),null);
    assert.equal(verifyUploadTicket(uploadTicket(id,code,Date.now()-1)),null);
    assert.equal(verifyUploadTicket('invalid'),null);
    assert.ok(!publicError({message:'SQL detail containing secret',code:'XX000'}).includes('secret'));
  }finally{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old;}
});
