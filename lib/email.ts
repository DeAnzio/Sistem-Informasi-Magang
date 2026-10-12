import nodemailer from "nodemailer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Decision = "diterima" | "ditolak";

export async function sendDecisionEmail(applicantId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: applicant, error } = await supabase.from("applicants").select("id, nama, email, status, catatan_admin").eq("id", applicantId).maybeSingle();
  if (error || !applicant || (applicant.status !== "diterima" && applicant.status !== "ditolak")) {
    throw new Error("Data keputusan pendaftar tidak tersedia.");
  }

  const decision = applicant.status as Decision;
  try {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 2525);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !user || !pass || !from || !Number.isInteger(port)) throw new Error("Konfigurasi SMTP belum lengkap.");
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    const subject = decision === "diterima" ? "Hasil Pendaftaran Permagangan" : "Informasi Pendaftaran Permagangan";
    const statusText = decision === "diterima" ? "diterima" : "belum dapat kami terima";
    const note = decision === "ditolak" && applicant.catatan_admin ? `<p>Catatan: ${escapeHtml(applicant.catatan_admin)}</p>` : "";
    await transporter.sendMail({
      from,
      to: applicant.email,
      subject,
      text: `Yth. ${applicant.nama},\n\nPendaftaran permagangan Anda ${statusText}.${decision === "ditolak" && applicant.catatan_admin ? `\n\nCatatan: ${applicant.catatan_admin}` : ""}\n\nHormat kami,\nBagian Kepegawaian`,
      html: `<p>Yth. ${escapeHtml(applicant.nama)},</p><p>Pendaftaran permagangan Anda <strong>${statusText}</strong>.</p>${note}<p>Hormat kami,<br>Bagian Kepegawaian</p>`,
    });
    await supabase.from("email_logs").insert({ applicant_id: applicantId, tipe: decision, status_kirim: "terkirim" });
    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Kesalahan pengiriman email.";
    await supabase.from("email_logs").insert({ applicant_id: applicantId, tipe: decision, status_kirim: "gagal", error_pesan: message });
    return { sent: false as const, message };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
