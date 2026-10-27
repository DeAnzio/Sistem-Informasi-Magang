// Uji HTTP terhadap build produksi dengan auth/database tiruan lokal.
// Tidak terhubung ke Supabase aktif, tidak mengirim email, dan tidak menyimpan data pengguna.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createPortServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const adminId = "00000000-0000-4000-8000-000000000001";
const applicantId = "00000000-0000-4000-8000-000000000002";
const divisionId = "00000000-0000-4000-8000-000000000003";
const requests = [];
const unexpected = [];
const applicant = {
  id: applicantId, nama: "Peserta Uji", email: "peserta@example.com", no_hp: "08123456789",
  asal_kampus: "Kampus Uji", jurusan: "Informatika", nim: "12345", divisi_id: divisionId,
  tanggal_mulai: "2030-01-01", tanggal_selesai: "2030-02-01", status: "pending", sumber: "manual",
  created_at: new Date().toISOString(), berkas_cv: null, berkas_surat_pengantar: null,
  catatan_admin: null, dibatalkan_at: null, catatan_batal: null, verified_by: null,
  divisi: { nama: "Divisi Uji" },
};
const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "admin@example.com",
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const backend = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({ path: url.pathname, body: body ? JSON.parse(body) : null });
  let result;
  if (url.pathname === "/auth/v1/user") result = user;
  else if (url.pathname === "/rest/v1/admins") result = [{ user_id: adminId, nama: "Admin Uji" }];
  else if (url.pathname === "/rest/v1/divisi") result = [{ id: divisionId, nama: "Divisi Uji", aktif: true, urutan: 1, kuota: 5 }];
  else if (url.pathname === "/rest/v1/applicants") result = [applicant];
  else if (url.pathname === "/rest/v1/aktivitas_pendaftar") result = [];
  else if (url.pathname === "/rest/v1/sesi_unggahan") result = [];
  else if (url.pathname === "/rest/v1/rpc/simpan_pendaftaran") result = {
    id: JSON.parse(body).p_id, status: "diterima", alreadySaved: false, notice: null,
  };
  else if (["terima_pendaftar", "tolak_pendaftar", "batalkan_pendaftar", "ubah_jadwal_pemagang", "ubah_divisi_pendaftar"]
    .some((name) => url.pathname === `/rest/v1/rpc/${name}`)) result = "ok";
  else { unexpected.push(url.pathname); response.statusCode = 500; result = { message: "Unexpected backend request" }; }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(result));
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const backendUrl = `http://127.0.0.1:${backend.address().port}`;
const portServer = createPortServer();
await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: backendUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-key", LOCAL_TEST_BACKEND_ORIGIN: backendUrl, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (key.startsWith("SMTP_")) delete env[key];
const guard = fileURLToPath(new URL("./local-backend-only.cjs", import.meta.url));
const server = spawn(process.execPath, ["--require", guard, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Server produksi tidak siap.")), 20_000);
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Server keluar: ${code}`)));
    server.stdout.on("data", (chunk) => { if (chunk.toString().includes("Ready")) { clearTimeout(timer); resolve(); } });
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: adminId, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}.local-signature`;
  const cookie = `sb-127-auth-token=base64-${encode({ access_token: accessToken, refresh_token: "local-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user })}`;
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { cookie, origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const action of [{ aksi: "terima" }, { aksi: "tolak", catatan: "Dokumen belum lengkap" },
    { aksi: "batalkan", catatan: "Mengundurkan diri" },
    { aksi: "ubah_jadwal", tanggalMulai: "2030-03-01", tanggalSelesai: "2030-04-01" },
    { aksi: "ubah_divisi", divisiId: divisionId }]) {
    const response = await post(`/api/pemagang/${applicantId}/aksi`, action);
    assert.equal(response.status, 200, `${action.aksi}: ${await response.clone().text()}`);
    assert.deepEqual(await response.json(), { result: "ok" });
    console.log(`${action.aksi}: berhasil tanpa konfigurasi pengiriman`);
  }
  const preparedResponse = await post("/api/pemagang/manual", { tahap: "siapkan", applicant, statusAwal: "diterima" });
  assert.equal(preparedResponse.status, 201, await preparedResponse.clone().text());
  const prepared = await preparedResponse.json();
  const savedResponse = await post("/api/pemagang/manual", { tahap: "simpan", ticket: prepared.ticket });
  assert.equal(savedResponse.status, 201, await savedResponse.clone().text());
  const saved = await savedResponse.json();
  assert.equal(saved.status, "diterima");
  assert.deepEqual(Object.keys(saved).sort(), ["id", "status"]);
  console.log("Input manual: berhasil tanpa opsi pengiriman");
  const detail = await fetch(`${base}/admin/pemagang/${applicantId}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  const html = await detail.text();
  assert.ok(html.includes(applicant.email), "Alamat email biodata tetap terlihat");
  assert.ok(!html.includes("Riwayat email") && !html.includes("Kirim email pemberitahuan"));
  assert.ok((await fetch(`${base}/api/email/retry`, { method: "POST" })).status === 404);
  assert.equal(unexpected.length, 0, `Request backend tidak diharapkan: ${unexpected.join(", ")}`);
  assert.ok(!requests.some((request) => request.path.includes("email_logs")));
  console.log("Detail peserta dan endpoint lama: panel hilang, retry 404, biodata email dipertahankan");
} finally {
  clearTimeout(timer);
  server.kill();
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
