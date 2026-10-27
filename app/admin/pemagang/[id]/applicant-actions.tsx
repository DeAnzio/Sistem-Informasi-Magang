"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApplicantActionInput } from "@/lib/applicant-action-schema";
import type { ApplicantStatus } from "@/lib/types";
import { tanggalMinimumSelesai } from "@/lib/tanggal";

type Action = "terima" | "tolak" | "batalkan" | "ubah_jadwal" | "ubah_divisi";
type Division = { id: string; nama: string; aktif: boolean };

type ActionResult = {
  error?: string;
  warning?: string;
};

export default function ApplicantActions({
  id,
  status,
  tanggalMulai,
  tanggalSelesai,
  divisiId,
  divisions,
  divisionsUnavailable,
}: {
  id: string;
  status: ApplicantStatus;
  tanggalMulai: string;
  tanggalSelesai: string;
  divisiId: string | null;
  divisions: Division[];
  divisionsUnavailable: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [catatan, setCatatan] = useState("");
  const [mulai, setMulai] = useState(tanggalMulai ?? "");
  const [selesai, setSelesai] = useState(tanggalSelesai ?? "");
  const [selectedDivisiId, setSelectedDivisiId] = useState(divisiId ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    if (!action) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); setAction(null); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [action]);

  function openAction(nextAction: Action) {
    setCatatan("");
    setMulai(tanggalMulai ?? "");
    setSelesai(tanggalSelesai ?? "");
    setSelectedDivisiId(divisiId ?? "");
    setNotice(null);
    setAction(nextAction);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setNotice(null);

    let body: ApplicantActionInput;
    if (action === "terima") body = { aksi: action };
    else if (action === "tolak") body = { aksi: action, catatan: catatan ?? "" };
    else if (action === "batalkan") body = { aksi: action, catatan: catatan ?? "" };
    else if (action === "ubah_jadwal") body = { aksi: action, tanggalMulai: mulai ?? "", tanggalSelesai: selesai ?? "" };
    else body = { aksi: action, divisiId: selectedDivisiId };

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

      let text = action === "ubah_divisi" ? "Divisi penempatan berhasil disimpan." : "Perubahan berhasil disimpan.";
      if (result.warning) text = result.warning;
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
    ubah_divisi: "Atur divisi penempatan",
  };
  const hasActiveDivision = divisions.some((division) => division.id === divisiId && division.aktif);

  return (
    <div className="applicant-actions">
      {status === "pending" && <>
        <button className="button button-green" type="button" disabled={!hasActiveDivision || divisionsUnavailable} onClick={() => openAction("terima")}>Terima</button>
        <button className="button button-dark" type="button" onClick={() => openAction("tolak")}>Tolak</button>
        <button className="button button-dark" type="button" onClick={() => openAction("ubah_jadwal")}>Ubah jadwal</button>
        <button className="button button-dark" type="button" disabled={divisionsUnavailable || !divisions.some((division) => division.aktif)} onClick={() => openAction("ubah_divisi")}>Atur divisi</button>
        {!hasActiveDivision && <p className="form-message">Tetapkan divisi aktif sebelum pendaftaran dapat diterima.</p>}
        {divisionsUnavailable && <p className="form-message error" role="alert">Daftar divisi tidak dapat dimuat.</p>}
      </>}
      {status === "diterima" && <>
        <button className="button button-dark" type="button" onClick={() => openAction("ubah_jadwal")}>Ubah jadwal</button>
        <button className="button button-danger" type="button" onClick={() => openAction("batalkan")}>Batalkan</button>
      </>}
      {notice && <p className={`form-message${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
      {action && <div className="action-dialog-backdrop">
        <section ref={dialogRef} tabIndex={-1} className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
          <h3 id="action-dialog-title">{actionTitle[action]}</h3>
          <form onSubmit={submit}><fieldset className="field form-fields" disabled={busy}>
            {action === "terima" && <p>Pastikan data dan ketersediaan kuota telah diperiksa sebelum menerima pendaftar.</p>}
            {action === "tolak" && <div className="field"><label htmlFor="action-note">Alasan penolakan (opsional)</label><textarea id="action-note" value={catatan ?? ""} maxLength={500} onChange={(event) => setCatatan(event.target.value)} /></div>}
            {action === "batalkan" && <>
              <p className="action-warning">Kuota divisi akan kembali tersedia. Tindakan ini tidak bisa dibatalkan.</p>
              <div className="field"><label htmlFor="action-note">Alasan pembatalan (wajib)</label><textarea id="action-note" value={catatan ?? ""} minLength={3} maxLength={500} required onChange={(event) => setCatatan(event.target.value)} /></div>
            </>}
            {action === "ubah_jadwal" && <>
              <p>Jadwal saat ini: {tanggalMulai} s.d. {tanggalSelesai}</p>
              <div className="field"><label htmlFor="action-start">Tanggal mulai baru</label><input id="action-start" type="date" value={mulai ?? ""} required onChange={(event) => setMulai(event.target.value)} /></div>
              <div className="field"><label htmlFor="action-end">Tanggal selesai baru</label><input id="action-end" type="date" value={selesai ?? ""} min={tanggalMinimumSelesai(mulai) ?? undefined} required onChange={(event) => setSelesai(event.target.value)} /><small>Durasi minimal 1 bulan dan maksimal 366 hari.</small></div>
              <p>Kapasitas divisi akan diperiksa ulang.</p>
            </>}
            {action === "ubah_divisi" && <div className="field"><label htmlFor="action-division">Divisi penempatan</label><select id="action-division" required value={selectedDivisiId} onChange={(event) => setSelectedDivisiId(event.target.value)}><option value="" disabled>Pilih divisi</option>{divisions.map((division) => <option key={division.id} value={division.id} disabled={!division.aktif}>{division.nama}{division.aktif ? "" : " (tidak aktif)"}</option>)}</select><small>Kapasitas akan diperiksa saat pendaftaran diterima.</small></div>}
            <div className="action-dialog-buttons">
              <button className="button button-dark" type="button" disabled={busy} onClick={() => setAction(null)}>Kembali</button>
              <button className={action === "batalkan" ? "button button-danger" : "button button-green"} type="submit" disabled={busy}>{busy ? "Memproses…" : "Konfirmasi"}</button>
            </div>
          </fieldset></form>
        </section>
      </div>}
    </div>
  );
}
