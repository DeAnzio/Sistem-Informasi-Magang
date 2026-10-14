import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Pelayanan Magang" },
  { href: "/ketentuan", label: "Ketentuan Magang" },
  { href: "/slot", label: "Informasi Kuota Magang" },
  { href: "/survey", label: "Survey Kepuasan" },
  { href: "/kontak", label: "Kontak" },
];

export default function PublicLayout({
  children,
  activePath,
  title,
}: {
  children: ReactNode;
  activePath: string;
  title?: string;
}) {
  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <header className="public-header">
        <div className="public-header-inner">
          <Link className="public-brand" href="/" aria-label="BPN D.I. Yogyakarta, beranda">
            <Image src="/bpn-logo.png" alt="" width={48} height={48} />
            <span><strong>BADAN PERTANAHAN NASIONAL</strong><small>D.I. YOGYAKARTA</small></span>
          </Link>
          <nav className="public-nav" aria-label="Navigasi utama">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
          <details className="public-mobile-menu">
            <summary aria-label="Buka menu navigasi"><span aria-hidden="true">☰</span></summary>
            <nav aria-label="Navigasi utama">
              {navigation.map((item) => (
                <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
              <Link className="mobile-apply-link" href="/daftar">Daftar magang</Link>
            </nav>
          </details>
          <Link className="public-header-cta" href="/daftar">Daftar magang <span aria-hidden="true">↗</span></Link>
        </div>
      </header>
      <main id="main-content">
        {title && (
          <div className="public-title-band">
            <div className="public-container">
              <h1>{title}</h1>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Pelayanan Magang</Link><span aria-hidden="true">›</span><span aria-current="page">{title}</span>
              </nav>
            </div>
          </div>
        )}
        {children}
      </main>
      <footer className="public-footer">
        <p>© 2026 Kantor Wilayah Badan Pertanahan Nasional D.I. Yogyakarta</p>
      </footer>
    </div>
  );
}
