import type {Database,Json} from './database.types';
import type {PreviewStatus} from './preview-types';
type Table<R>={Row:R;Insert:Partial<R>;Update:Partial<R>;Relationships:[]};
export type PortalApplicant=Omit<Database['public']['Tables']['applicants']['Row'],'status'|'nim'> & {
  status:PreviewStatus;nim:string|null;pesan_pendaftar:string;pemeriksaan:Json;
  catatan_perbaikan:Json;perbaikan_diminta_at:string|null;daftar_tunggu_at:string|null;
};
export type PortalDocument={id:string;applicant_id:string;jenis:string;versi:number;storage_path:string;nama_asli:string;mime_type:string;ukuran:number;created_at:string};
export type PortalCompletion={applicant_id:string;dokumen_id:string;status:'submitted'|'revision'|'approved';pesan:string;submitted_at:string;approved_at:string|null;diperiksa_oleh:string|null};
type Rpc<A,R=undefined>={Args:A;Returns:R};
export type PortalDatabase={public:{
  Tables:Omit<Database['public']['Tables'],'applicants'> & {
    applicants:Table<PortalApplicant>;
    akses_pelacakan:Table<{applicant_id:string;token_hash:string;created_at:string;revoked_at:string|null}>;
    dokumen_pendaftar:Table<PortalDocument>;
    penyelesaian_magang:Table<PortalCompletion>;
    survei_magang:Table<{applicant_id:string;informasi:number;pendaftaran:number;pelayanan:number;pengalaman:number;komentar:string;created_at:string}>;
    pengaturan_layanan:Table<{id:boolean;pendaftaran_dibuka:boolean;batas_pendaftaran:string|null;pengumuman:string;kontak:string;updated_at:string;updated_by:string|null}>;
    portal_sesi_unggahan:Table<{id:string;applicant_id:string;aksi:string;payload:Json;status:string;expires_at:string;created_at:string}>;
  };
  Views:Database['public']['Views'];Enums:{status_pendaftar:PreviewStatus};CompositeTypes:Database['public']['CompositeTypes'];
  Functions:Database['public']['Functions'] & {
    portal_batasi:Rpc<{p_kunci:string;p_limit:number;p_detik:number},boolean>;
    portal_finalisasi_unggahan:Rpc<{p_sesi:string},string>;
    portal_batalkan_sesi:Rpc<{p_sesi:string},boolean>;
    portal_simpan_pengaturan:Rpc<{p_admin:string;p_settings:Json}>;
    portal_simpan_pemeriksaan:Rpc<{p_id:string;p_admin:string;p_review:Json}>;
    portal_putuskan:Rpc<{p_id:string;p_admin:string;p_status:PreviewStatus;p_divisi:string|null;p_pesan:string;p_catatan:Json}>;
    portal_periksa_laporan:Rpc<{p_id:string;p_admin:string;p_setujui:boolean;p_pesan:string}>;
    portal_simpan_survei:Rpc<{p_id:string;p_scores:number[];p_komentar:string}>;
    portal_terbitkan_kode:Rpc<{p_id:string;p_admin:string;p_hash:string}>;
    portal_input_manual:Rpc<{p_admin:string;p_applicant:Json;p_divisi:string|null;p_hash:string},string>;
  };
}};
