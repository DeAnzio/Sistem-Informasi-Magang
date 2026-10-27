export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const target = new URL(request.url);
    // Next dapat menormalisasi 127.0.0.1 menjadi localhost di URL internal.
    // Host adalah otoritas request asli dan tidak bisa diganti JavaScript browser.
    const host = request.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  }
  catch { return false; }
}
