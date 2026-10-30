// Test-only preload. Seluruh HTTP server dibatasi ke backend tiruan lokal.
const originalFetch=globalThis.fetch;
globalThis.fetch=function(input,init){
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.href==='https://www.google.com/recaptcha/api/siteverify')
    return originalFetch(process.env.LOCAL_TEST_BACKEND_ORIGIN+'/__recaptcha',init);
  if(url.origin!==process.env.LOCAL_TEST_BACKEND_ORIGIN)
    return Promise.reject(new Error('Pengujian portal memblokir koneksi di luar backend lokal.'));
  return originalFetch(input,init);
};
