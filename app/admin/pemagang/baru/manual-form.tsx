"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Division = {
  id: string;
  nama: string;
};

type UploadTicketResponse = {
  error?: string;
  ticket?: string;
  uploads?: { jenis: "cv" | "surat"; path: string; token: string }[];
};

type SaveResponse = {
  error?: string;
  id?: string;
  status?: "pending" | "diterima";
  notice?: string;
  message?: string;
};

const maxFileSize = 5 * 1024 * 1024;
const acceptedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

function selectedFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.name ? value : null;
}

export default function ManualApplicantForm({ divisions }: { divisions: Division[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    setError(false);

    try {
      const cv = selectedFile(data.get("berkas_cv"));
      const surat = selectedFile(data.get("berkas_surat_pengantar"));
      for (const file of [cv, surat]) {
        if (file && (!acceptedTypes.has(file.type) || file.size <= 0 || file.size > maxFileSize)) {
          throw new Error("Berkas harus berupa PDF, JPG, atau PNG dengan ukuran maksimal 5 MB.");
        }
      }

      const applicant = {
        nama: String(data.get("nama") ?? ""),
        email: String(data.get("email") ?? ""),
        no_hp: String(data.get("no_hp") ?? ""),
        asal_kampus: String(data.get("asal_kampus") ?? ""),
        jurusan: String(data.get("jurusan") ?? ""),
        nim: String(data.get("nim") ?? ""),
        divisi_id: String(data.get("divisi_id") ?? ""),
        tanggal_mulai: String(data.get("tanggal_mulai") ?? ""),
        tanggal_selesai: String(data.get("tanggal_selesai") ?? ""),
      };
      const prepareResponse = await fetch("/api/pemagang/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tahap: "siapkan",
          applicant,
          statusAwal: data.get("statusAwal"),
          kirimEmail: data.get("kirimEmail") === "on",
          berkas_cv: cv ? { type: cv.type, size: cv.size } : null,
          berkas_surat_pengantar: surat ? { type: surat.type, size: surat.size } : null,
        }),
      });
      const prepared = await prepareResponse.json() as UploadTicketResponse;
      if (!prepareResponse.ok || !prepared.ticket) {
        throw new Error(prepared.error ?? "Data pemagang belum dapat disiapkan.");
      }

      const uploads = prepared.uploads ?? [];
      try {
        if (uploads.length) {
          const supabase = createSupabaseBrowserClient();
          for (const upload of uploads) {
            const file = upload.jenis === "cv" ? cv : surat;
            if (!file) throw new Error("Berkas unggahan tidak tersedia.");
            const { error: uploadError } = await supabase.storage
              .from("berkas")
              .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
            if (uploadError) throw new Error("Berkas tidak dapat diunggah. Periksa koneksi lalu coba kembali.");
          }
        }
      } catch (uploadError) {
        const cleanupResponse = await fetch("/api/pemagang/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tahap: "hapus", ticket: prepared.ticket }),
        }).catch(() => null);
        if (!cleanupResponse?.ok) {
          throw new Error("Unggahan gagal dan berkas sementara belum dapat dibersihkan. Hubungi administrator sistem.");
        }
        throw uploadError;
      }

      const saveResponse = await fetch("/api/pemagang/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tahap: "simpan", ticket: prepared.ticket }),
      });
      const result = await saveResponse.json() as SaveResponse;
      if (!saveResponse.ok || !result.id) {
        throw new Error(result.error ?? "Data pemagang belum dapat disimpan.");
      }

      form.reset();
      const query = result.notice ? `?hasil=${encodeURIComponent(result.notice)}` : "";
      router.push(`/admin/pemagang/${result.id}${query}`);
      router.refresh();
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Terjadi kesalahan. Silakan coba kembali.");
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field"><label htmlFor="nama">Nama lengkap</label><input id="nama" name="nama" autoComplete="name" maxLength={120} required /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        <div className="field"><label htmlFor="no_hp">Nomor telepon</label><input id="no_hp" name="no_hp" type="tel" autoComplete="tel" maxLength={30} required /></div>
        <div className="field"><label htmlFor="nim">NIM</label><input id="nim" name="nim" maxLength={50} required /></div>
        <div className="field"><label htmlFor="asal_kampus">Asal perguruan tinggi</label><input id="asal_kampus" name="asal_kampus" maxLength={160} required /></div>
        <div className="field"><label htmlFor="jurusan">Program studi</label><input id="jurusan" name="jurusan" maxLength={160} required /></div>
        <div className="field"><label htmlFor="divisi_id">Divisi</label><select id="divisi_id" name="divisi_id" required defaultValue=""><option value="" disabled>Pilih divisi</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.nama}</option>)}</select></div>
        <div className="field"><label htmlFor="statusAwal">Status awal</label><select id="statusAwal" name="statusAwal" defaultValue="diterima"><option value="diterima">Diterima</option><option value="pending">Menunggu verifikasi</option></select></div>
        <div className="field"><label htmlFor="tanggal_mulai">Tanggal mulai magang</label><input id="tanggal_mulai" name="tanggal_mulai" type="date" required /><small>Tanggal mulai dapat berada di masa lalu.</small></div>
        <div className="field"><label htmlFor="tanggal_selesai">Tanggal selesai magang</label><input id="tanggal_selesai" name="tanggal_selesai" type="date" required /><small>Harus setelah tanggal mulai; durasi maksimal 366 hari.</small></div>
        <div className="field"><label htmlFor="berkas_cv">Curriculum vitae (opsional)</label><input id="berkas_cv" name="berkas_cv" type="file" accept="application/pdf,image/jpeg,image/png" /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
        <div className="field"><label htmlFor="berkas_surat_pengantar">Surat pengantar (opsional)</label><input id="berkas_surat_pengantar" name="berkas_surat_pengantar" type="file" accept="application/pdf,image/jpeg,image/png" /><small>PDF, JPG, PNG · maksimal 5 MB</small></div>
        <div className="field field-wide">
          <label className="admin-checkbox-field"><input name="kirimEmail" type="checkbox" defaultChecked /> Kirim email pemberitahuan jika status awal diterima</label>
          <small>Email tidak dikirim jika status awal menunggu verifikasi.</small>
        </div>
        <div className="field field-wide"><button className="button button-green" type="submit" disabled={busy}>{busy ? "Menyimpan pemagang…" : "Simpan pemagang"} <span aria-hidden="true">→</span></button></div>
      </div>
      {message && <p className={`form-message${error ? " error" : ""}`} role={error ? "alert" : "status"}>{message}</p>}
    </form>
  );
}
