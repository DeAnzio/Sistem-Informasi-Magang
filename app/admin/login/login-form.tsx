"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      setMessage("Layanan login belum dikonfigurasi.");
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) setMessage("Email atau kata sandi tidak valid.");
    else router.push("/admin");
    setSubmitting(false);
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field field-wide"><label htmlFor="email">Email administrator</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field field-wide"><label htmlFor="password">Kata sandi</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <div className="field field-wide"><button className="button button-green" type="submit" disabled={submitting}>{submitting ? "Memeriksa…" : "Masuk"} <span aria-hidden="true">→</span></button></div>
      {message && <p className="form-message error field-wide" role="status">{message}</p>}
    </form>
  );
}
