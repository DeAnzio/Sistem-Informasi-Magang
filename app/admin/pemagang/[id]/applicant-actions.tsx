"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ApplicantStatus } from "@/lib/types";

type Action = "terima" | "tolak" | "batalkan" | "ubah_jadwal";

type ActionResult = {
  error?: string;
  emailSent?: boolean | null;
  emailMessage?: string;
};

export default function ApplicantActions({
  id,
  status,
  tanggalMulai,
  tanggalSelesai,
}: {
  id: string;
  status: ApplicantStatus;
  tanggalMulai: string;
  tanggalSelesai: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [catatan, setCatatan] = useState("");
  const [mulai, setMulai] = useState(tanggalMulai ?? "");
  const [selesai, setSelesai] = useState(tanggalSelesai ?? "");
  const [kirimEmail, setKirimEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  function openAction(nextAction: Action) {
    setCatatan("");
    setMulai(tanggalMulai ?? "");
    setSelesai(tanggalSelesai ?? "");
    setKirimEmail(true);
    setNotice(null);
    setAction(nextAction);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setNotice(null);

    let body:
      | { aksi: "terima"; kirimEmail: boolean }
      | { aksi: "tolak"; catatan: string; kirimEmail: boolean }
      | { aksi: "batalkan"; catatan: string; kirimEmail: boolean }
      | { aksi: "ubah_jadwal"; tanggalMulai: string; tanggalSelesai: string; kirimEmail: boolean };
    if (action === "terima") body = { aksi: action, kirimEmail };
    else if (action === "tolak") body = { aksi: action, catatan: catatan ?? "", kirimEmail };
    else if (action === "batalkan") body = { aksi: action, catatan: catatan ?? "", kirimEmail };
    else body = { aksi: action, tanggalMulai: mulai ?? "", tanggalSelesai: selesai ?? "", kirimEmail };

    try {
      const response = await fetch(`/api/pemagang/${id}/aksi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as ActionResult;
      if (!response.ok) {
        setNotice({ text: result.error ?? "Aksi belum berhasil disimpan.", error: true });
        return;
      }

      let text = "Perubahan berhasil disimpan.";
      if (result.emailSent === true) {
        text = result.emailMessage
          ? `Perubahan tersimpan. ${result.emailMessage}`
          : "Perubahan tersimpan dan email pemberitahuan terkirim.";
      } else if (result.emailSent === false) {
        text = `Perubahan tersimpan, tetapi email belum berhasil dikirim. ${result.emailMessage ?? "Silakan periksa riwayat email."}`;
      } else if (action === "ubah_jadwal" && status === "pending" && kirimEmail) {
        text = "Jadwal diperbarui. Email tidak dikirim untuk pendaftar berstatus menunggu.";
      }
      setNotice({ text, error: false });
      setAction(null);
      router.refresh();
    } catch {
      setNotice({ text: "Layanan aksi pemagang tidak dapat dijangkau.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const actionTitle: Record<Action, string> = {
    terima: "Terima pemagang",
    tolak: "Tolak pendaftaran",
    batalkan: "Batalkan pemagangan",
    ubah_jadwal: "Ubah jadwal magang",
  };

  return (
    <div className="applicant-actions">
      {status === "pending" && <>
        <button className="button button-green" type="button" onClick={() => openAction("terima")}>Terima</button>
        <button className="button button-dark" type="button" onClick={() => openAction("tolak")}>Tolak</button>
        <button className="button button-dark" type="button" onClick={() => openAction("ubah_jadwal")}>Ubah jadwal</button>
      </>}
      {status === "diterima" && <>
        <button className="button button-dark" type="button" onClick={() => openAction("ubah_jadwal")}>Ubah jadwal</button>
        <button className="button button-danger" type="button" onClick={() => openAction("batalkan")}>Batalkan</button>
      </>}
      {notice && <p className={`form-message${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
      {action && <div className="action-dialog-backdrop">
        <section className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
          <h3 id="action-dialog-title">{actionTitle[action]}</h3>
          <form className="field" onSubmit={submit}>
            {action === "terima" && <p>Pastikan data dan ketersediaan kuota telah diperiksa sebelum menerima pendaftar.</p>}
            {action === "tolak" && <div className="field"><label htmlFor="action-note">Alasan penolakan (opsional)</label><textarea id="action-note" value={catatan ?? ""} maxLength={500} onChange={(event) => setCatatan(event.target.value)} /></div>}
            {action === "batalkan" && <>
              <p className="action-warning">Kuota divisi akan kembali tersedia. Tindakan ini tidak bisa dibatalkan.</p>
              <div className="field"><label htmlFor="action-note">Alasan pembatalan (wajib)</label><textarea id="action-note" value={catatan ?? ""} minLength={3} maxLength={500} required onChange={(event) => setCatatan(event.target.value)} /></div>
            </>}
            {action === "ubah_jadwal" && <>
              <p>Jadwal saat ini: {tanggalMulai} s.d. {tanggalSelesai}</p>
              <div className="field"><label htmlFor="action-start">Tanggal mulai baru</label><input id="action-start" type="date" value={mulai ?? ""} required onChange={(event) => setMulai(event.target.value)} /></div>
              <div className="field"><label htmlFor="action-end">Tanggal selesai baru</label><input id="action-end" type="date" value={selesai ?? ""} required onChange={(event) => setSelesai(event.target.value)} /></div>
              <p>Kapasitas divisi akan diperiksa ulang.</p>
              {status === "pending" && <p>Email tidak dikirim untuk perubahan jadwal pendaftar berstatus menunggu.</p>}
            </>}
            <label className="action-email-option"><input type="checkbox" checked={Boolean(kirimEmail)} onChange={(event) => setKirimEmail(event.target.checked)} /> Kirim email pemberitahuan</label>
            <div className="action-dialog-buttons">
              <button className="button button-dark" type="button" disabled={busy} onClick={() => setAction(null)}>Kembali</button>
              <button className={action === "batalkan" ? "button button-danger" : "button button-green"} type="submit" disabled={busy}>{busy ? "Memproses…" : "Konfirmasi"}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
