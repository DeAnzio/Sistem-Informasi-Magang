"use client";
import { applicantSchema, fileMetadataSchema, validationMessage } from "@/lib/applicant-schema";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isDurasiMagangValid, tanggalMinimumSelesai } from "@/lib/tanggal";

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

export default function RegistrationForm({ recaptchaSiteKey }: { recaptchaSiteKey: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");
  const [dateError, setDateError] = useState("");
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
    const tanggalMulai = String(data.get("tanggal_mulai"));
    const tanggalSelesai = String(data.get("tanggal_selesai"));
    if (!isDurasiMagangValid(tanggalMulai, tanggalSelesai)) {
      setDateError("Tanggal selesai harus sekurang-kurangnya satu bulan setelah tanggal mulai dan durasi maksimal 366 hari.");
      return;
    }
    setDateError("");
    setSubmitting(true);
    try {
      const cv = data.get("berkas_cv");
      const surat = data.get("berkas_surat_pengantar");
      if (!(cv instanceof File) || !(surat instanceof File)) throw new Error("CV dan surat pengantar wajib diunggah.");
      for (const [label, file] of [["CV", cv], ["Surat pengantar", surat]] as const) {
        const parsedFile = fileMetadataSchema.safeParse({ type: file.type, size: file.size });
        if (!parsedFile.success) throw new Error(`${label}: ${validationMessage(parsedFile.error)}`);
      }
      const applicant = applicantSchema.safeParse(Object.fromEntries(data));
      if (!applicant.success) throw new Error(validationMessage(applicant.error));
      if (!recaptchaToken) throw new Error("Centang kotak reCAPTCHA untuk membuktikan bahwa Anda bukan robot.");
      const uploadResponse = await fetch("/api/daftar/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...applicant.data,
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
      setTanggalMulai("");
      setTanggalSelesai("");
      setDateError("");
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
        <fieldset className="form-grid form-fields" disabled={submitting}>
          <div className="field"><label htmlFor="tanggal_mulai">Tanggal mulai magang</label><input id="tanggal_mulai" name="tanggal_mulai" type="date" value={tanggalMulai} required onChange={(event) => {
            const nextValue = event.target.value;
            setTanggalMulai(nextValue);
            setDateError(tanggalSelesai && !isDurasiMagangValid(nextValue, tanggalSelesai) ? "Tanggal selesai harus sekurang-kurangnya satu bulan setelah tanggal mulai dan durasi maksimal 366 hari." : "");
          }} /></div>
          <div className="field"><label htmlFor="tanggal_selesai">Tanggal selesai magang</label><input id="tanggal_selesai" name="tanggal_selesai" type="date" value={tanggalSelesai} min={tanggalMinimumSelesai(tanggalMulai) ?? undefined} required onChange={(event) => {
            const nextValue = event.target.value;
            setTanggalSelesai(nextValue);
            setDateError(tanggalMulai && !isDurasiMagangValid(tanggalMulai, nextValue) ? "Tanggal selesai harus sekurang-kurangnya satu bulan setelah tanggal mulai dan durasi maksimal 366 hari." : "");
          }} /><small>Durasi minimal 1 bulan dan maksimal 366 hari.</small>{dateError && <small role="alert">{dateError}</small>}</div>
          <div className="field"><label htmlFor="nama">Nama lengkap</label><input id="nama" name="nama" minLength={2} autoComplete="name" maxLength={120} required /></div>
          <div className="field"><label htmlFor="email">Email aktif</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
          <div className="field"><label htmlFor="no_hp">Nomor telepon</label><input id="no_hp" name="no_hp" type="tel" inputMode="numeric" autoComplete="tel" pattern="[0-9]{8,13}" title="Masukkan 8 sampai 13 digit angka." maxLength={13} required onChange={(event) => {
            event.target.value = event.target.value.replace(/\D/g, "").slice(0, 13);
          }} /></div>
          <div className="field"><label htmlFor="nim">NIM</label><input id="nim" name="nim" type="text" inputMode="numeric" pattern="[0-9]{2,15}" title="NIM hanya boleh berisi 2 sampai 15 angka." maxLength={15} required onChange={(event) => {
            event.target.value = event.target.value.replace(/\D/g, "").slice(0, 15);
          }} /></div>
          <div className="field"><label htmlFor="asal_kampus">Asal perguruan tinggi</label><input id="asal_kampus" name="asal_kampus" minLength={2} maxLength={160} required /></div>
          <div className="field"><label htmlFor="jurusan">Program studi</label><input id="jurusan" name="jurusan" minLength={2} maxLength={30} required /></div>
          <div className="field"><label htmlFor="berkas_cv">Curriculum vitae</label><input id="berkas_cv" name="berkas_cv" type="file" accept="application/pdf,image/jpeg,image/png" required /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
          <div className="field"><label htmlFor="berkas_surat_pengantar">Surat pengantar</label><input id="berkas_surat_pengantar" name="berkas_surat_pengantar" type="file" accept="application/pdf,image/jpeg,image/png" required /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
        </fieldset>
        <div className="recaptcha-widget" ref={recaptchaContainer} />
        <p className="recaptcha-notice">Formulir ini dilindungi reCAPTCHA. <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Kebijakan Privasi</a> dan <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Persyaratan Layanan</a> Google berlaku.</p>
        <div className="field field-wide"><button className="button button-green" type="submit" disabled={submitting}>{submitting ? "Mengirim pendaftaran…" : "Kirim pendaftaran"} <span aria-hidden="true">→</span></button></div>
        {message && <p className={`form-message${error ? " error" : ""}`} role="status">{message}</p>}
      </form>
      <aside className="form-aside"><h2>Sebelum mengirim</h2><p>Pastikan informasi yang diberikan sesuai dokumen resmi agar proses verifikasi berjalan lancar.</p><ul><li>Gunakan alamat email yang aktif.</li><li>Unggah berkas dalam format PDF, JPG, atau PNG.</li><li>Penempatan divisi ditentukan oleh administrator.</li></ul><Link className="text-link" href="/slot">Lihat informasi kuota ↗</Link></aside>
    </div>
  );
}
