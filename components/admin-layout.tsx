import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children, backHref = "/admin", backLabel = "Kembali ke dashboard", className = "" }: {
  children: ReactNode; backHref?: string; backLabel?: string; className?: string;
}) {
  return <main className={`admin-shell ${className}`}>
    <a className="admin-skip-link" href="#admin-main">Lewati ke konten utama</a>
    <div className="utility-bar"><div className="shell utility-inner"><span>RUANG ADMINISTRATOR</span><Link href={backHref}>{backLabel} <span aria-hidden="true">↗</span></Link></div></div>
    <header className="site-header shell"><Link className="brand" href="/admin"><span className="brand-mark" aria-hidden="true">BPN</span><span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA · ADMINISTRATOR</small></span></Link><nav><form action="/api/admin/logout" method="post"><button className="button button-dark button-small" type="submit">Keluar</button></form></nav></header>
    <section id="admin-main" className="page-main shell">{children}</section>
    <footer className="site-footer"><div className="shell admin-panel-footer"><span>© {new Date().getFullYear()} PORTAL PERMAGANGAN</span><span>KANTOR PERTANAHAN KOTA YOGYAKARTA</span></div></footer>
  </main>;
}
