import Link from "next/link";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const message = params.setup ? "Konfigurasikan Supabase untuk mengaktifkan login admin." : params.unauthorized ? "Akun ini belum terdaftar sebagai administrator." : "Masuk menggunakan akun yang telah didaftarkan oleh administrator.";
  return (
    <main className="admin-shell admin-login-shell">
      <div className="utility-bar"><div className="shell utility-inner"><span>AREA ADMINISTRATOR</span><Link href="/">Kembali ke portal <span aria-hidden="true">↗</span></Link></div></div>
      <header className="site-header shell"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link></header>
      <section className="page-main shell">
        <div className="page-head"><p className="eyebrow">AREA ADMINISTRATOR</p><h1>Masuk ke portal</h1><p>{message}</p></div>
        <LoginForm />
      </section>
      <footer className="site-footer"><div className="shell admin-panel-footer"><span>© 2026 PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
    </main>
  );
}
