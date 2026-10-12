import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Layanan Magang | BPN D.I. Yogyakarta",
  description: "Informasi layanan magang dan praktek kerja lapangan BPN D.I. Yogyakarta.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
