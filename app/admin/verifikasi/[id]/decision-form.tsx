"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DecisionForm({ id }: { id: string }) {
  const router = useRouter();
  const [catatan, setCatatan] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(aksi: "terima" | "tolak") {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/verifikasi/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi, catatan }),
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error ?? "Keputusan gagal disimpan.");
    else {
      setMessage(result.emailSent ? "Keputusan tersimpan dan email terkirim." : "Keputusan tersimpan, tetapi email belum terkirim. Admin dapat mengirim ulang dari halaman detail.");
      router.push(`/admin/verifikasi/${id}?email=${result.emailSent ? "sent" : "failed"}`);
    }
    setBusy(false);
  }

  return <div className="field"><label htmlFor="catatan">Catatan penolakan (opsional)</label><textarea id="catatan" value={catatan} onChange={(event) => setCatatan(event.target.value)} maxLength={1000} /><button className="button button-green" disabled={busy} onClick={() => decide("terima")} type="button">{busy ? "Memproses…" : "Terima pendaftar"}</button><button className="button button-dark" disabled={busy} onClick={() => decide("tolak")} type="button">Tolak pendaftar</button>{message && <p className="form-message error" role="status">{message}</p>}</div>;
}
