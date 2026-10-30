import type { PreviewApplicant } from './preview-types';

export const staffPages = {
  ringkasan: 'Ringkasan', tugas: 'Pusat tugas', pengajuan: 'Pengajuan',
  'daftar-tunggu': 'Daftar tunggu', penyelesaian: 'Penyelesaian',
  survei: 'Survei kepuasan', kalender: 'Kalender peserta',
  laporan: 'Laporan periode', pengaturan: 'Pengaturan layanan',
} as const;
export type StaffPage = keyof typeof staffPages;
export const staffHref = (page: string) => '/admin' + (page === 'ringkasan' ? '' : '/' + page);
export const documentLabels = { cv: 'CV', surat: 'Surat pengantar' } as const;
export type RevisionNotes = Partial<Record<keyof typeof documentLabels, string>>;
export function parseRevisionNotes(input: unknown): RevisionNotes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Catatan berkas tidak valid.');
  const notes: RevisionNotes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(documentLabels,key) || typeof value !== 'string' || value.trim().length > 1000) throw Error('Catatan berkas tidak valid atau melebihi 1000 karakter.');
    if (value.trim()) notes[key as keyof RevisionNotes] = value.trim();
  }
  if (!Object.keys(notes).length) throw Error('Isi catatan perbaikan untuk CV atau surat pengantar.');
  return notes;
}
export function validateRevisionFiles(notes: RevisionNotes | undefined, files: FormData) {
  for (const kind of Object.keys(notes || {}) as (keyof RevisionNotes)[]) {
    const file = files.get(kind);
    if (!(file instanceof File) || !file.size) throw Error(`Unggah perbaikan ${documentLabels[kind]} sesuai catatan petugas.`);
  }
}
export function pendingTasks(rows: PreviewApplicant[]) {
  return rows.flatMap(p => {
    const report = p.status === 'diterima' && p.completion?.state === 'submitted';
    if (!report && !['pending', 'diperiksa'].includes(p.status)) return [];
    const kind = report ? 'laporan' : p.status === 'diperiksa' ? 'perbaikan' : 'baru';
    const at = report ? p.completion!.submittedAt : kind === 'perbaikan'
      ? [...p.history].reverse().find(h => h.text === 'Pendaftar mengirim berkas perbaikan')?.at || p.created : p.created;
    return [{ applicant: p, kind, at, label: report ? 'Periksa laporan akhir' : kind === 'perbaikan' ? 'Periksa berkas perbaikan' : 'Periksa pengajuan baru' }];
  }).sort((a, b) => a.at.localeCompare(b.at) || a.applicant.id.localeCompare(b.applicant.id));
}
