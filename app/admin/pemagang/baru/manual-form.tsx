"use client";

import { useState, type FormEvent } from "react";

type Division = {
  id: string;
  nama: string;
};

export default function ManualApplicantForm({ divisions }: { divisions: Division[] }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pemagang", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Data peserta belum dapat disimpan.");
      setMessage(`Data peserta tersimpan dengan status pending. ID: ${result.id}`);
      form.reset();
      setError(false);
    } catch (submitError) {
      setMessage(submitError instanceof Error ? submitError.message : "Terjadi kesalahan.");
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-grid" onSubmit={submit}><div className="field field-wide"><label htmlFor="divisi_id">Divisi</label><select id="divisi_id" name="divisi_id" required defaultValue=""><option value="" disabled>Pilih divisi</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.nama}</option>)}</select></div><div className="field"><label htmlFor="tanggal_mulai">Tanggal mulai magang</label><input id="tanggal_mulai" name="tanggal_mulai" type="date" required /></div><div className="field"><label htmlFor="tanggal_selesai">Tanggal selesai magang</label><input id="tanggal_selesai" name="tanggal_selesai" type="date" required /><small>Durasi maksimal 366 hari.</small></div><div className="field"><label htmlFor="nama">Nama lengkap</label><input id="nama" name="nama" maxLength={120} required /></div><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" maxLength={254} required /></div><div className="field"><label htmlFor="no_hp">Nomor telepon</label><input id="no_hp" name="no_hp" maxLength={30} required /></div><div className="field"><label htmlFor="nim">NIM</label><input id="nim" name="nim" maxLength={50} required /></div><div className="field"><label htmlFor="asal_kampus">Asal perguruan tinggi</label><input id="asal_kampus" name="asal_kampus" maxLength={160} required /></div><div className="field"><label htmlFor="jurusan">Program studi</label><input id="jurusan" name="jurusan" maxLength={160} required /></div><div className="field field-wide"><button className="button button-green" type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan pendaftar"} <span aria-hidden="true">→</span></button></div>{message && <p className={`form-message field-wide${error ? " error" : ""}`} role="status">{message}</p>}</form>;
}
