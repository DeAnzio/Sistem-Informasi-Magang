import assert from "node:assert/strict";
import { test } from "node:test";
import { applicantSchema, fileMetadataSchema, manualApplicantSchema } from "../lib/applicant-schema";
import { isDurasiMagangValid, tanggalMinimumSelesai } from "../lib/tanggal";
import { escapeApplicantSearchTerm, buildApplicantQuery } from "../lib/pemagang-filters";
import { readAllPages } from "../lib/read-all-pages";
import { hasValidOrigin } from "../lib/request-origin";
import { createRegistrationTicket, verifyRegistrationTicket } from "../lib/registration-ticket";
import { createManualApplicantTicket } from "../lib/manual-applicant-ticket";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { applicantActionSchema } from "../lib/applicant-action-schema";

const applicant = {
  nama: "  Peserta Uji  ", email: " peserta@example.com ", no_hp: "08123456789",
  asal_kampus: "Kampus Uji", jurusan: "Informatika", nim: "12345",
  tanggal_mulai: "2030-01-31", tanggal_selesai: "2030-02-28",
};

test("keputusan admin hanya membutuhkan data aksi tanpa opsi pengiriman", () => {
  for (const action of [
    { aksi: "terima" }, { aksi: "tolak", catatan: "Belum memenuhi syarat" },
    { aksi: "batalkan", catatan: "Mengundurkan diri" },
    { aksi: "ubah_jadwal", tanggalMulai: "2030-01-01", tanggalSelesai: "2030-02-01" },
    { aksi: "ubah_divisi", divisiId: "00000000-0000-4000-8000-000000000001" },
  ]) assert.equal(applicantActionSchema.safeParse(action).success, true);
  assert.equal(applicantActionSchema.safeParse({ aksi: "terima", kirimEmail: true }).success, false);
  assert.equal(applicantActionSchema.safeParse({ aksi: "batalkan", catatan: "" }).success, false);
});

test("validasi sama untuk online/manual, trim identitas dan batas berkas", () => {
  const parsed = applicantSchema.parse(applicant);
  assert.equal(parsed.nama, "Peserta Uji");
  assert.equal(parsed.email, "peserta@example.com");
  assert.equal(manualApplicantSchema.safeParse({ ...applicant, divisi_id: "bukan-uuid" }).success, false);
  assert.equal(applicantSchema.safeParse({ ...applicant, nama: " " }).success, false);
  assert.equal(fileMetadataSchema.safeParse({ type: "image/svg+xml", size: 100 }).success, false);
  assert.equal(fileMetadataSchema.safeParse({ type: "application/pdf", size: 0 }).success, false);
  assert.equal(fileMetadataSchema.safeParse({ type: "application/pdf", size: 5242881 }).success, false);
});

test("durasi kalender akhir bulan, tahun kabisat, dan batas 366 hari", () => {
  assert.equal(tanggalMinimumSelesai("2024-01-31"), "2024-02-29");
  assert.equal(tanggalMinimumSelesai("2025-01-31"), "2025-02-28");
  assert.equal(isDurasiMagangValid("2025-02-30", "2025-04-01"), false);
  assert.equal(isDurasiMagangValid("2025-01-01", "2026-01-02"), true);
  assert.equal(isDurasiMagangValid("2025-01-01", "2026-01-03"), false);
});

test("pencarian membentuk regex literal dan query deterministik", async () => {
  let requestUrl = "";
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    global: { fetch: async (input) => {
      requestUrl = String(input);
      return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "*/0" } });
    } },
  });
  const term = 'Kampus (A), "B" * . %_';
  const decoded = escapeApplicantSearchTerm(term).slice(1, -1).replace(/\\([\\"])/g, "$1");
  assert.equal(new RegExp(decoded, "i").test(term), true);
  assert.equal(new RegExp(decoded, "i").test('Kampus A, "B" apa saja . %_'), false);
  await buildApplicantQuery(client, { q: term, status: "pending", phase: "", divisionId: "", fromDate: "", throughDate: "", sort: "nama" });
  const url = new URL(requestUrl);
  assert.equal(url.searchParams.get("order"), "nama.asc,id.asc");
  assert.ok(url.searchParams.get("or")?.includes("nama.imatch."));
});

test("ekspor tetap lengkap bila server membatasi halaman ke 100 baris", async () => {
  const all = Array.from({ length: 1207 }, (_, id) => ({ id }));
  const result = await readAllPages(async (from, to) => ({
    data: all.slice(from, Math.min(to + 1, from + 100)), error: null, count: all.length,
  }), all.length);
  assert.deepEqual(result, all);
  await assert.rejects(readAllPages(async () => ({ data: [], error: null, count: 10 }), 10));
  await assert.rejects(readAllPages(async () => ({ data: [{ id: 1 }], error: null, count: 11 }), 10));
});

test("asal mutasi menolak domain, protokol, dan Origin yang tidak valid", () => {
  const request = (origin: string) => new Request("https://portal.example/api/daftar", { headers: { origin } });
  assert.equal(hasValidOrigin(request("https://portal.example")), true);
  assert.equal(hasValidOrigin(request("http://portal.example")), false);
  assert.equal(hasValidOrigin(request("https://evil.example")), false);
  assert.equal(hasValidOrigin(request("null")), false);
  assert.equal(hasValidOrigin(new Request("http://localhost:3100/api/daftar", {
    headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
  })), true);
  assert.equal(hasValidOrigin(new Request("https://internal.example/api/daftar", {
    headers: { host: "portal.example", origin: "https://evil.example" },
  })), false);
});

test("tiket menolak modifikasi, kedaluwarsa, dan pertukaran tujuan manual/online", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-signing-key";
  const payload = {
    applicantId: "00000000-0000-4000-8000-000000000001", expiresAt: Date.now() + 60_000,
    applicant: applicantSchema.parse(applicant),
    files: { berkas_cv: "test/cv.pdf", berkas_surat_pengantar: "test/surat.pdf" },
  };
  assert.ok(verifyRegistrationTicket(createRegistrationTicket(payload)));
  assert.equal(verifyRegistrationTicket(createRegistrationTicket({ ...payload, expiresAt: Date.now() - 1 })), null);
  const ticket = createRegistrationTicket(payload);
  assert.equal(verifyRegistrationTicket(ticket.slice(0, -1) + (ticket.endsWith("a") ? "b" : "a")), null);
  const manual = createManualApplicantTicket({ ...payload, adminId: payload.applicantId,
    applicant: { ...payload.applicant, divisi_id: payload.applicantId }, statusAwal: "pending" });
  assert.equal(verifyRegistrationTicket(manual), null);
});
