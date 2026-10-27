// Kontrak SQL versi fondasi. Perbarui bersama migrasi; dapat diganti hasil
// `supabase gen types typescript` setelah migrasi diterapkan pada proyek tujuan.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<Row, Required extends keyof Row, Relationships extends { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] }[] = []> = {
  Row: Row; Insert: Pick<Row, Required> & Partial<Row>; Update: Partial<Row>; Relationships: Relationships;
};
type Status = "pending" | "diterima" | "ditolak" | "dibatalkan";
type Applicant = {
  id: string; nama: string; email: string; no_hp: string; asal_kampus: string; jurusan: string; nim: string;
  divisi_id: string | null; tanggal_mulai: string; tanggal_selesai: string;
  berkas_cv: string | null; berkas_surat_pengantar: string | null; status: Status;
  catatan_admin: string | null; sumber: "online" | "manual"; verified_by: string | null;
  verified_at: string | null; created_at: string; dibatalkan_at: string | null; catatan_batal: string | null;
};
type Decision = { Args: { p_id: string; p_admin: string }; Returns: string };
export type Database = {
  public: {
    Tables: {
      admins: Table<{ user_id: string; nama: string }, "user_id" | "nama">;
      divisi: Table<{ id: string; nama: string; urutan: number; kuota: number; aktif: boolean }, "nama" | "urutan">;
      applicants: Table<Applicant, "nama" | "email" | "no_hp" | "asal_kampus" | "jurusan" | "nim" | "tanggal_mulai" | "tanggal_selesai", [{
        foreignKeyName: "applicants_divisi_id_fkey"; columns: ["divisi_id"]; isOneToOne: false;
        referencedRelation: "divisi"; referencedColumns: ["id"];
      }]>;
      aktivitas_pendaftar: Table<{ id: string; applicant_id: string; aksi: string; detail: Json | null; oleh: string | null; waktu: string }, "applicant_id" | "aksi">;
      aktivitas_kuota: Table<{ id: string; divisi_id: string; sebelum: number; sesudah: number; oleh: string; waktu: string }, "divisi_id" | "sebelum" | "sesudah" | "oleh">;
      sesi_unggahan: Table<{ id: string; admin_id: string | null; sumber: "online" | "manual"; applicant: Json; files: Json; status_awal: "pending" | "diterima"; status: "siap" | "tersimpan" | "dibatalkan"; expires_at: string; created_at: string }, "id" | "sumber" | "applicant" | "files" | "expires_at">;
    };
    Views: { [_ in never]: never };
    Functions: {
      get_slot_info: { Args: Record<string, never>; Returns: { divisi_id: string; divisi_nama: string; urutan: number; kuota: number; terisi: number; terjadwal: number; sisa: number; status: string }[] };
      terima_pendaftar: Decision;
      tolak_pendaftar: { Args: Decision["Args"] & { p_catatan: string }; Returns: string };
      batalkan_pendaftar: { Args: Decision["Args"] & { p_catatan: string }; Returns: string };
      ubah_jadwal_pemagang: { Args: Decision["Args"] & { p_mulai: string; p_selesai: string }; Returns: string };
      ubah_divisi_pendaftar: { Args: Decision["Args"] & { p_divisi: string }; Returns: string };
      ubah_kuota_divisi: { Args: { p_divisi: string; p_kuota: number; p_admin: string }; Returns: string };
      simpan_pendaftaran: { Args: { p_id: string; p_admin?: string | null }; Returns: Json };
      batalkan_unggahan: { Args: { p_id: string; p_admin?: string | null }; Returns: boolean };
    };
    Enums: { status_pendaftar: Status };
    CompositeTypes: { [_ in never]: never };
  };
};
