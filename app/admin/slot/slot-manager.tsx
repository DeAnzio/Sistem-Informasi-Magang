"use client";

import { useState } from "react";

type DivisionCapacity = {
  divisi_id: string;
  divisi_nama: string;
  urutan: number;
  kuota: number;
  terisi: number;
  terjadwal: number;
  sisa: number;
  status: string;
};

export default function SlotManager({ divisions: initialDivisions }: { divisions: DivisionCapacity[] }) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [editingId, setEditingId] = useState("");
  const [quota, setQuota] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveQuota(divisionId: string) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/admin/slot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisi_id: divisionId, kuota: Number(quota) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kuota belum dapat diperbarui.");
      setDivisions((current) => current.map((division) => division.divisi_id === divisionId
        ? { ...division, kuota: result.kuota, sisa: Math.max(result.kuota - division.terisi, 0), status: result.kuota > division.terisi ? "tersedia" : "penuh" }
        : division));
      setEditingId("");
      setQuota("");
      setMessage("Kuota divisi berhasil diperbarui.");
    } catch (saveError) {
      setError(true);
      setMessage(saveError instanceof Error ? saveError.message : "Layanan kuota tidak dapat dijangkau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {message && <p className={`form-message${error ? " error" : ""}`} role="status" style={{ marginBottom: 18 }}>{message}</p>}
      {divisions.length === 0 ? <p className="form-message">Belum ada divisi aktif.</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Divisi</th><th>Kapasitas</th><th>Sedang magang</th><th>Akan datang</th><th>Sisa saat ini</th><th>Atur kuota</th></tr></thead>
            <tbody>{divisions.map((division) => (
              <tr key={division.divisi_id}>
                <td><strong>{division.divisi_nama}</strong></td>
                <td>{division.kuota}</td>
                <td>{division.terisi}</td>
                <td>{division.terjadwal}</td>
                <td>{division.sisa}</td>
                <td>{editingId === division.divisi_id ? (
                  <div className="quota-edit">
                    <input aria-label={`Kuota untuk ${division.divisi_nama}`} type="number" min="0" max="500" value={quota} onChange={(event) => setQuota(event.target.value)} />
                    <button className="button button-green button-small" type="button" disabled={busy || quota === ""} onClick={() => saveQuota(division.divisi_id)}>Simpan</button>
                    <button className="button button-dark button-small" type="button" disabled={busy} onClick={() => { setEditingId(""); setQuota(""); }}>Batal</button>
                  </div>
                ) : <button className="button button-dark button-small" type="button" onClick={() => { setEditingId(division.divisi_id); setQuota(String(division.kuota)); }}>Ubah kuota</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
