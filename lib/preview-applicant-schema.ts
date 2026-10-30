import {z} from 'zod';
import {applicantFields,validApplicantDuration,durationIssue} from './applicant-schema';
import type {PreviewStatus} from './preview-types';
export const normalizeEmail=(value:string)=>value.trim().toLowerCase();
export const normalizePhone=(value:string)=>value.replace(/[\s-]/g,'');
export const phoneMessage='Nomor telepon harus diawali 08 dan terdiri dari 10–13 digit.';
export const previewApplicantFields=applicantFields.omit({nim:true}).extend({
 email:z.string().transform(normalizeEmail).pipe(z.email('Alamat email tidak valid.').max(254)),
 no_hp:z.string().transform(normalizePhone).pipe(z.string().regex(/^08[0-9]{8,11}$/,phoneMessage)),
});
export const previewApplicantSchema=previewApplicantFields.refine(validApplicantDuration,durationIssue);
export const activeApplication=(status:PreviewStatus)=>!['ditolak','dibatalkan','selesai'].includes(status);
export function emailInUse(rows:{id:string;email:string;status:PreviewStatus}[],email:string,exceptId?:string){return rows.some(p=>p.id!==exceptId&&activeApplication(p.status)&&normalizeEmail(p.email)===normalizeEmail(email));}
