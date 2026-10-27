import { manualApplicantSchema } from "@/lib/applicant-schema";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const manualApplicantTicketSchema = z.object({
  applicantId: z.uuid(),
  adminId: z.uuid(),
  expiresAt: z.number().int(),
  applicant: manualApplicantSchema,
  statusAwal: z.enum(["pending", "diterima"]),
  files: z.object({
    berkas_cv: z.string().nullable(),
    berkas_surat_pengantar: z.string().nullable(),
  }),
});

export type ManualApplicantTicketPayload = z.infer<typeof manualApplicantTicketSchema>;

function signature(payload: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Konfigurasi server belum tersedia.");
  return createHmac("sha256", secret).update("manual:" + payload).digest("base64url");
}

export function createManualApplicantTicket(payload: ManualApplicantTicketPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyManualApplicantTicket(ticket: string): ManualApplicantTicketPayload | null {
  const [encoded, suppliedSignature, extra] = ticket.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signature(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const payload = manualApplicantTicketSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
