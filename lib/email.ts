import nodemailer from "nodemailer";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const applicantEmailTypeSchema = z.enum(["diterima", "ditolak", "dibatalkan", "jadwal_diubah"]);
export type ApplicantEmailType = z.infer<typeof applicantEmailTypeSchema>;

type Schedule = {
  tanggalMulai: string;
  tanggalSelesai: string;
};

type EmailResult = {
  sent: boolean;
  logged: boolean;
  message?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

async function logEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  applicantId: string,
  type: ApplicantEmailType,
  status: "terkirim" | "gagal",
  errorMessage?: string,
): Promise<boolean> {
  const { error } = await supabase.from("email_logs").insert({
    applicant_id: applicantId,
    tipe: type,
    status_kirim: status,
    ...(errorMessage ? { error_pesan: errorMessage.slice(0, 500) } : {}),
  });
  if (error) {
    console.error("Gagal mencatat status email pemagang.", { message: error.message });
    return false;
  }
  return true;
}

function messageFor(type: ApplicantEmailType, name: string, note: string, previousSchedule: Schedule | null, currentSchedule: Schedule): {
  subject: string;
  text: string;
  html: string;
} {
  const greeting = `Yth. ${name},`;
  const closing = "Hormat kami,\nBagian Kepegawaian";
  const htmlClosing = "<p>Hormat kami,<br>Bagian Kepegawaian</p>";
  const safeName = escapeHtml(name);

  if (type === "diterima") {
    return {
      subject: "Hasil Pendaftaran Permagangan",
      text: `${greeting}\n\nPendaftaran permagangan Anda telah diterima.\n\n${closing}`,
      html: `<p>Yth. ${safeName},</p><p>Pendaftaran permagangan Anda telah <strong>diterima</strong>.</p>${htmlClosing}`,
    };
  }
  if (type === "ditolak") {
    return {
      subject: "Informasi Pendaftaran Permagangan",
      text: `${greeting}\n\nPendaftaran permagangan Anda belum dapat kami terima.${note ? `\n\nCatatan: ${note}` : ""}\n\n${closing}`,
      html: `<p>Yth. ${safeName},</p><p>Pendaftaran permagangan Anda belum dapat kami terima.</p>${note ? `<p>Catatan: ${escapeHtml(note)}</p>` : ""}${htmlClosing}`,
    };
  }
  if (type === "dibatalkan") {
    const contact = "Silakan hubungi petugas pengelola magang apabila terdapat pertanyaan.";
    return {
      subject: "Pemberitahuan Pembatalan Magang",
      text: `${greeting}\n\nKegiatan magang Anda telah dibatalkan.${note ? `\n\nCatatan: ${note}` : ""}\n\n${contact}\n\n${closing}`,
      html: `<p>Yth. ${safeName},</p><p>Kegiatan magang Anda telah dibatalkan.</p>${note ? `<p>Catatan: ${escapeHtml(note)}</p>` : ""}<p>${contact}</p>${htmlClosing}`,
    };
  }

  const oldRange = previousSchedule
    ? `${formatDate(previousSchedule.tanggalMulai)} s.d. ${formatDate(previousSchedule.tanggalSelesai)}`
    : "Tidak tersedia";
  const newRange = `${formatDate(currentSchedule.tanggalMulai)} s.d. ${formatDate(currentSchedule.tanggalSelesai)}`;
  return {
    subject: "Pemberitahuan Perubahan Jadwal Magang",
    text: `${greeting}\n\nJadwal magang Anda telah diubah.\nJadwal sebelumnya: ${oldRange}\nJadwal baru: ${newRange}\n\n${closing}`,
    html: `<p>Yth. ${safeName},</p><p>Jadwal magang Anda telah diubah.</p><p>Jadwal sebelumnya: ${escapeHtml(oldRange)}<br>Jadwal baru: ${escapeHtml(newRange)}</p>${htmlClosing}`,
  };
}

export async function sendApplicantEmail(
  applicantId: string,
  type: ApplicantEmailType,
  previousSchedule: Schedule | null = null,
): Promise<EmailResult> {
  const supabase = createSupabaseAdminClient();
  const { data: applicant, error } = await supabase
    .from("applicants")
    .select("nama, email, status, catatan_admin, catatan_batal, tanggal_mulai, tanggal_selesai")
    .eq("id", applicantId)
    .maybeSingle();

  if (error || !applicant) {
    const message = "Data pemagang untuk email tidak tersedia.";
    const logged = await logEmail(supabase, applicantId, type, "gagal", message);
    return { sent: false, logged, message };
  }

  const isStatusMatch =
    (type === "diterima" && applicant.status === "diterima") ||
    (type === "ditolak" && applicant.status === "ditolak") ||
    (type === "dibatalkan" && applicant.status === "dibatalkan") ||
    (type === "jadwal_diubah" && applicant.status === "diterima");
  if (!isStatusMatch) {
    const message = "Email tidak dikirim karena status pemagang sudah berubah.";
    const logged = await logEmail(supabase, applicantId, type, "gagal", message);
    return { sent: false, logged, message };
  }

  const currentSchedule = {
    tanggalMulai: applicant.tanggal_mulai,
    tanggalSelesai: applicant.tanggal_selesai,
  };
  const content = messageFor(
    type,
    applicant.nama,
    type === "dibatalkan" ? applicant.catatan_batal ?? "" : applicant.catatan_admin ?? "",
    previousSchedule,
    currentSchedule,
  );

  try {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 2525);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;
    if (!host || !user || !pass || !from || !Number.isInteger(port)) {
      throw new Error("Konfigurasi SMTP belum lengkap.");
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: applicant.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Kesalahan pengiriman email.";
    const logged = await logEmail(supabase, applicantId, type, "gagal", message);
    return { sent: false, logged, message: "Email belum berhasil dikirim." };
  }

  const logged = await logEmail(supabase, applicantId, type, "terkirim");
  return logged
    ? { sent: true, logged: true }
    : { sent: true, logged: false, message: "Email terkirim, tetapi status pengiriman belum dapat dicatat." };
}

function previousScheduleFromActivity(detail: unknown): Schedule | null {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
  const oldSchedule = (detail as Record<string, unknown>).dari;
  if (typeof oldSchedule !== "object" || oldSchedule === null || Array.isArray(oldSchedule)) return null;
  const { mulai, selesai } = oldSchedule as Record<string, unknown>;
  const startResult = z.iso.date().safeParse(mulai);
  const endResult = z.iso.date().safeParse(selesai);
  if (!startResult.success || !endResult.success) return null;
  return { tanggalMulai: startResult.data, tanggalSelesai: endResult.data };
}

export async function resendLastApplicantEmail(applicantId: string): Promise<EmailResult> {
  const supabase = createSupabaseAdminClient();
  const { data: lastEmail, error } = await supabase
    .from("email_logs")
    .select("tipe, status_kirim")
    .eq("applicant_id", applicantId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Riwayat email pemagang belum dapat dimuat.");
  if (!lastEmail || lastEmail.status_kirim !== "gagal") {
    return { sent: false, logged: true, message: "Email terakhir tidak berstatus gagal." };
  }
  const type = applicantEmailTypeSchema.safeParse(lastEmail.tipe);
  if (!type.success) throw new Error("Jenis email terakhir tidak valid.");

  let previousSchedule: Schedule | null = null;
  if (type.data === "jadwal_diubah") {
    const { data: activity, error: activityError } = await supabase
      .from("aktivitas_pendaftar")
      .select("detail")
      .eq("applicant_id", applicantId)
      .eq("aksi", "ubah_jadwal")
      .order("waktu", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activityError) throw new Error("Riwayat perubahan jadwal belum dapat dimuat.");
    previousSchedule = previousScheduleFromActivity(activity?.detail);
  }

  return sendApplicantEmail(applicantId, type.data, previousSchedule);
}
