import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Layanan Magang | Kantor Pertanahan Kota Yogyakarta",
  description: "Informasi layanan magang dan praktek kerja lapangan Kantor Pertanahan Kota Yogyakarta.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
