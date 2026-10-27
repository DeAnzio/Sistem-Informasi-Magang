// Preload sebelum Next dimulai: build yang berisi URL lain harus gagal,
// bukan menghubungi proyek Supabase sungguhan saat smoke test.
const originalFetch = globalThis.fetch;
globalThis.fetch = function localBackendFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== process.env.LOCAL_TEST_BACKEND_ORIGIN) {
    return Promise.reject(new Error("Smoke test hanya mengizinkan backend tiruan lokal. Buat build pengujian tanpa konfigurasi proyek aktif."));
  }
  return originalFetch(input, init);
};
