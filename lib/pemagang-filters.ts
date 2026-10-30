import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { ApplicantStatus } from "./types";
import { hariIniWIB } from "./tanggal";

export function escapeApplicantSearchTerm(value: string): string {
  // imatch (~*) menghindari alias wildcard '*' milik LIKE PostgREST.
  const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${literal.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
export type ApplicantFilters = {
  q: string; status: ApplicantStatus | ""; phase: string; divisionId: string;
  fromDate: string; throughDate: string; sort: "terbaru" | "tanggal_mulai" | "nama";
};

export function buildApplicantQuery(supabase: SupabaseClient<Database>, filters: ApplicantFilters, head = false) {
  let query = supabase.from("applicants").select(
    "id, nama, email, no_hp, asal_kampus, jurusan, nim, divisi_id, tanggal_mulai, tanggal_selesai, status, sumber, verified_by, verified_at, created_at, divisi:divisi(nama)",
    { count: "exact", head },
  );
  if (filters.q) {
    const search = escapeApplicantSearchTerm(filters.q);
    query = query.or(`nama.imatch.${search},email.imatch.${search},asal_kampus.imatch.${search}`);
  }
  if (filters.phase) {
    const today = hariIniWIB();
    query = query.eq("status", "diterima");
    if (filters.phase === "akan_datang") query = query.gt("tanggal_mulai", today);
    if (filters.phase === "aktif") query = query.lte("tanggal_mulai", today).gte("tanggal_selesai", today);
    if (filters.phase === "selesai") query = query.lt("tanggal_selesai", today);
  } else if (filters.status) query = query.eq("status", filters.status);
  if (filters.divisionId) query = query.eq("divisi_id", filters.divisionId);
  if (filters.throughDate) query = query.lte("tanggal_mulai", filters.throughDate);
  if (filters.fromDate) query = query.gte("tanggal_selesai", filters.fromDate);
  if (filters.sort === "tanggal_mulai") query = query.order("tanggal_mulai").order("created_at", { ascending: false });
  else if (filters.sort === "nama") query = query.order("nama");
  else query = query.order("created_at", { ascending: false });
  return query.order("id");
}
