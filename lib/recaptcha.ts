import { z } from "zod";

const verificationResponseSchema = z.object({
  success: z.boolean(),
  score: z.number().optional(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

const minimumScore = 0.5;
const expectedAction = "submit_registration";

type VerificationResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "request_failed" | "rejected" };

export async function verifyRegistrationRecaptcha(token: string, expectedHostname: string): Promise<VerificationResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: false, reason: "not_configured" };

  let response: Response;
  let body: unknown;
  try {
    response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, reason: "request_failed" };
    body = await response.json();
  } catch {
    return { ok: false, reason: "request_failed" };
  }

  const result = verificationResponseSchema.safeParse(body);
  if (!result.success) return { ok: false, reason: "request_failed" };
  const verification = result.data;
  if (
    !verification.success ||
    verification.action !== expectedAction ||
    verification.hostname?.toLowerCase() !== expectedHostname.toLowerCase() ||
    typeof verification.score !== "number" ||
    verification.score < minimumScore
  ) {
    return { ok: false, reason: "rejected" };
  }

  return { ok: true };
}
