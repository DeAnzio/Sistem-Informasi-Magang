import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const ticketPayloadSchema = z.object({
  applicantId: z.uuid(),
  expiresAt: z.number().int(),
  applicant: z.object({
    nama: z.string(),
    email: z.email(),
    no_hp: z.string(),
    asal_kampus: z.string(),
    jurusan: z.string(),
    nim: z.string(),
    divisi_id: z.uuid(),
    tanggal_mulai: z.iso.date(),
    tanggal_selesai: z.iso.date(),
  }),
  files: z.object({
    berkas_cv: z.string(),
    berkas_surat_pengantar: z.string(),
  }),
});

export type RegistrationTicketPayload = z.infer<typeof ticketPayloadSchema>;

function signature(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Konfigurasi server belum tersedia.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createRegistrationTicket(payload: RegistrationTicketPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyRegistrationTicket(ticket: string): RegistrationTicketPayload | null {
  const [encoded, suppliedSignature, extra] = ticket.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = ticketPayloadSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
