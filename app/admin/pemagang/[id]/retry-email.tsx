"use client";

import { useState } from "react";

export default function RetryEmail({ applicantId }: { applicantId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/email/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantId }),
      });
      const result = await response.json();
      setMessage(response.ok
        ? result.emailMessage ?? "Email berhasil dikirim."
        : result.error ?? "Email belum berhasil dikirim.");
    } catch {
      setMessage("Layanan email tidak dapat dijangkau.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="field"><button className="button button-dark" type="button" disabled={busy} onClick={retry}>{busy ? "Mengirim…" : "Kirim ulang email"}</button>{message && <p className="form-message" role="status">{message}</p>}</div>;
}
