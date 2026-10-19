"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Division = { id: string; nama: string };

declare global {
  interface Window {
    grecaptcha?: {
      render(
        container: HTMLElement,
        parameters: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ): number;
      reset(widgetId?: number): void;
    };
  }
}

export default function RegistrationForm({ divisions, initialDivisionId, recaptchaSiteKey }: { divisions: Division[]; initialDivisionId: string; recaptchaSiteKey: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const recaptchaContainer = useRef<HTMLDivElement>(null);
  const recaptchaWidgetId = useRef<number | null>(null);

  function renderRecaptcha(attempt = 0) {
    const recaptcha = window.grecaptcha;
    const container = recaptchaContainer.current;
    if (recaptchaWidgetId.current !== null || !container) return;

    if (!recaptcha?.render) {
      if (attempt < 20) {
        window.setTimeout(() => renderRecaptcha(attempt + 1), 100);
      } else {
        setMessage("Checkbox reCAPTCHA gagal dimuat. Pastikan kunci yang dipasang adalah reCAPTCHA v2 Checkbox dan domain situs sudah terdaftar.");
        setError(true);
      }
      return;
    }

    try {
      recaptchaWidgetId.current = recaptcha.render(container, {
        sitekey: recaptchaSiteKey,
        callback: (token) => setRecaptchaToken(token),
        "expired-callback": () => setRecaptchaToken(""),
        "error-callback": () => {
          setRecaptchaToken("");
          setMessage("reCAPTCHA tidak dapat dimuat. Periksa koneksi, tipe kunci v2 Checkbox, dan domain yang terdaftar.");
          setError(true);
        },
      });
    } catch {
      setMessage("Checkbox reCAPTCHA gagal ditampilkan. Pastikan kunci adalah reCAPTCHA v2 Checkbox dan domain situs sudah terdaftar.");
      setError(true);
    }
  }

  function resetRecaptcha() {
    setRecaptchaToken("");
    if (recaptchaWidgetId.current !== null) {
      window.grecaptcha?.reset(recaptchaWidgetId.current);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setError(false);

    const data = new FormData(form);
    setSubmitting(true);
    try {
      const tanggalMulai = String(data.get("tanggal_mulai"));
      const tanggalSelesai = String(data.get("tanggal_selesai"));
      const durationDays = (Date.parse(`${tanggalSelesai}T00:00:00Z`) - Date.parse(`${tanggalMulai}T00:00:00Z`)) / 86_400_000;
      if (durationDays <= 0 || durationDays > 366) {
        throw new Error("Tanggal selesai harus setelah tanggal mulai dan durasi maksimal 366 hari.");
      }
      const cv = data.get("berkas_cv");
      const surat = data.get("berkas_surat_pengantar");
      if (!(cv instanceof File) || !(surat instanceof File)) throw new Error("CV dan surat pengantar wajib diunggah.");
      if (!recaptchaToken) throw new Error("Centang kotak reCAPTCHA untuk membuktikan bahwa Anda bukan robot.");
      const uploadResponse = await fetch("/api/daftar/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: data.get("nama"), email: data.get("email"), no_hp: data.get("no_hp"),
          asal_kampus: data.get("asal_kampus"), jurusan: data.get("jurusan"), nim: data.get("nim"),
          divisi_id: data.get("divisi_id"),
          tanggal_mulai: tanggalMulai,
          tanggal_selesai: tanggalSelesai,
          recaptchaToken,
          berkas_cv: { type: cv.type, size: cv.size },
          berkas_surat_pengantar: { type: surat.type, size: surat.size },
        }),
      });
      const uploadInfo = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadInfo.error ?? "Tidak dapat memulai unggahan berkas.");

      const supabase = createSupabaseBrowserClient();
      for (const upload of uploadInfo.uploads as { path: string; token: string }[]) {
        const file = upload.path.includes("/cv.") ? cv : surat;
        const { error: uploadError } = await supabase.storage.from("berkas").uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (uploadError) {
          await fetch("/api/daftar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: uploadInfo.ticket, cleanup: true }) });
          throw new Error("Berkas tidak dapat diunggah. Periksa koneksi lalu coba kembali.");
        }
      }

      const response = await fetch("/api/daftar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: uploadInfo.ticket }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Pendaftaran belum berhasil diproses.");
      setMessage("Pendaftaran berhasil dikirim. Simpan informasi ini: " + result.id);
      form.reset();
      resetRecaptcha();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Silakan coba kembali.");
      setError(true);
      resetRecaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-layout">
      <Script src="https://www.google.com/recaptcha/api.js?render=explicit" strategy="afterInteractive" onReady={() => renderRecaptcha()} onError={() => {
        setMessage("reCAPTCHA tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.");
        setError(true);
      }} />
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field-wide"><label htmlFor="divisi_id">Divisi yang dituju</label><select id="divisi_id" name="divisi_id" defaultValue={initialDivisionId} required><option value="" disabled>Pilih divisi</option>{divisions.map((division) => <option value={division.id} key={division.id}>{division.nama}</option>)}</select></div>
          <div className="field"><label htmlFor="tanggal_mulai">Tanggal mulai magang</label><input id="tanggal_mulai" name="tanggal_mulai" type="date" required /></div>
          <div className="field"><label htmlFor="tanggal_selesai">Tanggal selesai magang</label><input id="tanggal_selesai" name="tanggal_selesai" type="date" required /><small>Durasi maksimal 366 hari.</small></div>
          <div className="field"><label htmlFor="nama">Nama lengkap</label><input id="nama" name="nama" autoComplete="name" maxLength={120} required /></div>
          <div className="field"><label htmlFor="email">Email aktif</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
          <div className="field"><label htmlFor="no_hp">Nomor telepon</label><input id="no_hp" name="no_hp" type="tel" autoComplete="tel" maxLength={30} required /></div>
          <div className="field"><label htmlFor="nim">NIM</label><input id="nim" name="nim" maxLength={50} required /></div>
          <div className="field"><label htmlFor="asal_kampus">Asal perguruan tinggi</label><input id="asal_kampus" name="asal_kampus" maxLength={160} required /></div>
          <div className="field"><label htmlFor="jurusan">Program studi</label><input id="jurusan" name="jurusan" maxLength={160} required /></div>
          <div className="field"><label htmlFor="berkas_cv">Curriculum vitae</label><input id="berkas_cv" name="berkas_cv" type="file" accept="application/pdf,image/jpeg,image/png" required /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
          <div className="field"><label htmlFor="berkas_surat_pengantar">Surat pengantar</label><input id="berkas_surat_pengantar" name="berkas_surat_pengantar" type="file" accept="application/pdf,image/jpeg,image/png" required /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
        </div>
        <div className="recaptcha-widget" ref={recaptchaContainer} />
        <p className="recaptcha-notice">Formulir ini dilindungi reCAPTCHA. <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Kebijakan Privasi</a> dan <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Persyaratan Layanan</a> Google berlaku.</p>
        <div className="field field-wide"><button className="button button-green" type="submit" disabled={submitting}>{submitting ? "Mengirim pendaftaran…" : "Kirim pendaftaran"} <span aria-hidden="true">→</span></button></div>
        {message && <p className={`form-message${error ? " error" : ""}`} role="status">{message}</p>}
      </form>
      <aside className="form-aside"><h2>Sebelum mengirim</h2><p>Pastikan informasi yang diberikan sesuai dokumen resmi agar proses verifikasi berjalan lancar.</p><ul><li>Gunakan alamat email yang aktif.</li><li>Unggah berkas dalam format PDF, JPG, atau PNG.</li><li>Durasi magang maksimal 366 hari.</li><li>Ketersediaan kuota dihitung dari tanggal yang Anda ajukan.</li></ul><Link className="text-link" href="/slot">Lihat informasi kuota ↗</Link></aside>
    </div>
  );
}
