// Kontrak lama dihentikan agar halaman yang masih terbuka tidak melewati alur portal.
export async function POST(){return Response.json({error:'Versi formulir sudah berubah. Muat ulang halaman untuk menggunakan layanan terbaru.'},{status:409,headers:{'Cache-Control':'no-store'}});}
