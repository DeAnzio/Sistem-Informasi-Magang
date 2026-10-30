import Link from 'next/link';
import type {PreviewSettings} from '@/lib/preview-types';
import type {PublicCapacity} from '@/lib/preview-capacity';
import {PageTitle} from './preview-shared';
import s from './preview.module.css';
export function Terms(){return <><PageTitle title='Ketentuan magang' text='Kegiatan, hak dan kewajiban, tata tertib, serta penyelesaian program.'/>
<article className={s.panel}>
        <section className={s.section}>
          <h2>A. Kegiatan Magang</h2>
          <ol>
            <li>Peserta mengikuti kegiatan sesuai tujuan pembelajaran yang disampaikan lembaga pendidikan.</li>
            <li>Peserta ditempatkan pada unit kerja berdasarkan kebutuhan dan ketersediaan pembimbing.</li>
            <li>Peserta wajib mematuhi arahan pembimbing dan menjaga etika selama berada di lingkungan kantor.</li>
            <li>Peserta menjaga kerahasiaan data dan informasi yang diperoleh selama kegiatan.</li>
            <li>Peserta menggunakan tanda pengenal dan berpakaian rapi sesuai ketentuan kantor.</li>
            <li>Peserta menggunakan fasilitas kantor secara bertanggung jawab.</li>
            <li>Peserta menyampaikan kendala pelaksanaan kepada pembimbing atau petugas pengelola.</li>
            <li>Pada akhir kegiatan, peserta menyelesaikan laporan yang mencakup:
              <ul><li>uraian kegiatan dan pembelajaran yang diperoleh;</li><li>presentasi laporan kepada pembimbing atau unit kerja; dan</li><li>pengunggahan laporan melalui mekanisme yang diinformasikan petugas.</li></ul>
            </li>
            <li>Surat keterangan magang dapat diproses setelah:
              <ul><li>masa kegiatan selesai;</li><li>laporan dan presentasi telah diselesaikan; dan</li><li>peserta mengembalikan tanda pengenal serta menyelesaikan administrasi.</li></ul>
            </li>
          </ol>
        </section>
        <section className={s.section}>
          <h2>B. Hak dan Kewajiban</h2>
          <ol>
            <li>Instansi
              <ul><li><strong>Kewajiban</strong><ul><li>Memberikan arahan kegiatan sesuai penempatan dan kapasitas unit kerja.</li><li>Menunjuk pembimbing atau petugas penghubung selama program berlangsung.</li></ul></li><li><strong>Hak</strong><ul><li>Meminta peserta menaati ketentuan kantor dan menjaga kerahasiaan informasi.</li><li>Menghentikan kegiatan apabila terjadi pelanggaran ketentuan.</li></ul></li></ul>
            </li>
            <li>Peserta
              <ul><li><strong>Kewajiban</strong><ul><li>Melaksanakan kegiatan dengan disiplin, sopan, dan bertanggung jawab.</li><li>Menyelesaikan laporan serta tugas yang disepakati bersama pembimbing.</li></ul></li><li><strong>Hak</strong><ul><li>Mendapatkan bimbingan dan informasi yang diperlukan untuk kegiatan magang.</li><li>Mendapatkan surat keterangan setelah memenuhi persyaratan penyelesaian.</li></ul></li></ul>
            </li>
          </ol>
        </section>
        <section className={s.section}>
          <h2>C. Tata Tertib</h2>
          <h3>1. Umum</h3>
          <ul><li>Menjaga nama baik lembaga pendidikan dan instansi.</li><li>Mengikuti aturan keamanan, keselamatan, dan ketertiban kantor.</li><li>Tidak menyebarluaskan dokumen atau data kedinasan tanpa izin.</li></ul>
          <h3>2. Kehadiran</h3>
          <ul><li>Hadir sesuai jadwal yang telah disepakati dengan pembimbing.</li><li>Menginformasikan ketidakhadiran atau keterlambatan kepada pembimbing.</li></ul>
          <h3>3. Tambahan</h3>
          <ul><li>Penggunaan perangkat dan akses kantor harus mendapat izin petugas.</li><li>Pelanggaran dapat ditindaklanjuti melalui:
            <ul><li>teguran lisan atau tertulis;</li><li>pemberitahuan kepada lembaga pendidikan; atau</li><li>pengakhiran kegiatan magang sesuai hasil evaluasi.</li></ul>
          </li></ul>
        </section>
        <section className={s.section}>
          <h2>D. Fasilitas</h2>
          <ol><li>Peserta memperoleh arahan terkait tugas dan lingkungan kerja.</li><li>Fasilitas kerja diberikan sesuai ketersediaan dan kebijakan unit penempatan.</li><li>Surat keterangan dapat diberikan setelah kewajiban kegiatan dipenuhi.</li></ol>
        </section>
        <section className={s.section}>
          <h2>E. Kuota</h2>
          <p>Penerimaan peserta menyesuaikan ketersediaan pembimbing, unit kerja, dan kuota pada periode yang berjalan. Informasi kuota dapat diperiksa pada halaman <Link href="/slot">Informasi Kuota Magang</Link>.</p>
        </section>
        <section className={s.section}>
          <h2>F. Lain-lain</h2>
          <p>Informasi layanan: <Link href="/">Pelayanan Magang Kantor Pertanahan Kota Yogyakarta</Link>.</p>
          <p>Pengelola: petugas pengelola magang pada unit kerja terkait.</p>
          <p>Kontak: silakan lihat halaman <Link href="/kontak">Kontak Kami</Link> untuk kanal resmi.</p>
          <p className="content-note">Ketentuan di halaman ini merupakan rancangan informasi umum dan perlu diselaraskan dengan peraturan resmi instansi sebelum dipublikasikan.</p>
        </section>
      </article></>;}
export function Capacity({items}:{items:PublicCapacity[]|null}){return <><PageTitle title='Informasi kuota magang' text='Kapasitas penempatan dan jumlah peserta berdasarkan data layanan.'/><section className={s.panel}><p>Terisi dan sisa dihitung untuk hari ini (WIB). Peserta mendatang belum mengurangi sisa hari ini. Ketersediaan pada jadwal pengajuan Anda tetap diperiksa petugas.</p>{items===null?<p role='status'>Memuat kuota…</p>:!items.length?<p>Belum ada divisi yang tersedia.</p>:<div className={s.tableWrap} tabIndex={0} role='region' aria-label='Informasi kuota divisi'><table><thead><tr>{['Divisi','Kapasitas','Sedang magang','Akan datang','Sisa saat ini','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{items.map(d=><tr key={d.name}><td>{d.name}</td><td>{d.quota}</td><td>{d.current}</td><td>{d.upcoming}</td><td>{d.remaining}</td><td><span className={s.badge}>{d.remaining?'Tersedia':'Penuh'}</span></td></tr>)}</tbody></table></div>}<div className={s.actions}><Link className={s.primary} href='/daftar'>Ajukan magang</Link></div></section></>;}
function ContactIcon({kind}:{kind:string}){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">{kind==='map'?<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>:kind==='mail'?<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 5 10 8L22 5"/></>:kind==='Instagram'?<><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></>:kind==='Facebook'?<path d="M14 22V12h4l1-4h-5V6c0-2 1-3 3-3h2V0h-3c-4 0-6 2-6 6v2H6v4h4v10"/>:kind==='TikTok'?<path d="M14 3v13a4 4 0 1 1-4-4M14 3c1 4 3 6 7 6"/>:kind==='X'?<><path d="m4 3 16 18M20 3 4 21"/></>:<><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 6 3-6 3Z" fill="currentColor"/></>}</svg>;}
const socials=[['Instagram','kantahkotayogyakarta','https://www.instagram.com/kantahkotayogyakarta/'],['Facebook','kantah.yogyakarta','https://www.facebook.com/kantah.yogyakarta'],['TikTok','@kantahkotayogyakarta','https://www.tiktok.com/@kantahkotayogyakarta'],['X','atr_bpnkotyogya','https://x.com/atr_bpnkotyogya'],['YouTube','@kantahkotayogyakarta2057','https://www.youtube.com/@kantahkotayogyakarta2057']];
export function Contact({settings}:{settings:PreviewSettings|null}){return <><PageTitle title='Kontak layanan' text='Melayani, Profesional, Terpercaya'/><div className={s.twoCol}><section className={s.panel}><h2>Kantor Pertanahan Kota Yogyakarta</h2><h3>Informasi kontak</h3><dl className={s.details}><div><dt className={s.contactLabel}><ContactIcon kind='map'/>Alamat</dt><dd>Jln. Kusumanegara No.161, Muja Muju, Umbulharjo, Kota Yogyakarta, Daerah Istimewa Yogyakarta 55165</dd></div><div><dt className={s.contactLabel}><ContactIcon kind='mail'/>Surat / email</dt><dd><a href='mailto:kot-yogyakarta@atrbpn.go.id'>kot-yogyakarta@atrbpn.go.id</a></dd></div><div><dt>Narahubung</dt><dd>{settings?.contact||'Memuat informasi petugas…'}</dd></div></dl><h3>Sosial media</h3><ul className={s.socialLinks}>{socials.map(([platform,name,url])=><li key={platform}><a href={url} target='_blank' rel='noopener noreferrer'><ContactIcon kind={platform}/><span><strong>{platform}</strong><small>{name}</small></span><span aria-hidden='true'>↗</span></a></li>)}</ul></section><iframe className={s.contactMap} title='Lokasi Kantor Pertanahan Kota Yogyakarta' src='https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3952.885256406523!2d110.39074927455422!3d-7.801970877447789!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e7a5764f9ebd92b%3A0x70024ba01158bec4!2sBPN%20KOTA%20YOGYAKARTA!5e0!3m2!1sen!2sid!4v1735284519974!5m2!1sen!2sid' loading='lazy' referrerPolicy='no-referrer-when-downgrade'/></div></>;}
export function SurveyInfo(){return <><PageTitle title='Survei kepuasan layanan' text='Bantu kami memperbaiki pengalaman pengajuan dan pelayanan magang.'/><section className={s.panel}><h2>Pengalaman Anda menjadi bahan perbaikan</h2><p>Survei mencakup kejelasan informasi, kemudahan pengajuan, respons petugas, dan kepuasan layanan secara keseluruhan. Anda juga dapat menyampaikan saran.</p><p>Survei tersedia melalui kode pelacakan setelah petugas menetapkan magang selesai. Setiap pengajuan dapat mengirim satu jawaban. Jawaban terhubung dengan pengajuan dan dapat diakses pengelola; survei ini tidak anonim.</p><div className={s.actions}><Link className={s.primary} href='/lacak'>Lacak pengajuan dan isi survei</Link><Link className={s.secondary} href='/kontak'>Hubungi pengelola</Link></div><p>Jika Anda belum menyelesaikan magang, informasi layanan tetap dapat ditanyakan melalui petugas.</p></section></>;}
export function ServiceDetails(){return <section className={s.section}><div className={s.twoCol}><article className={s.panel}><h2>Isi surat pengantar</h2><p>Siapkan surat resmi dari lembaga pendidikan yang memuat:</p><ul><li>Nama peserta dan program studi.</li><li>Bidang atau unit tujuan dan periode magang.</li><li>Nama dosen/guru penanggung jawab.</li><li>Kontak yang dapat dihubungi.</li></ul><p>Lampirkan CV dan surat pengantar dalam PDF, JPG, atau PNG, maksimal 5 MB per berkas.</p></article><article className={s.panel}><h2>Standar pelayanan dan pengiriman surat</h2><p>Baca <Link href='/ketentuan'>ketentuan magang</Link> sebelum mengajukan. Standar pelayanan dan SOP resmi dapat diminta kepada petugas pengelola.</p><p>Surat dapat disampaikan melalui mekanisme yang ditetapkan instansi. Untuk pengiriman langsung atau melalui email, konfirmasikan kanal resmi melalui <Link href='/kontak'>Kontak layanan</Link>.</p><p>Hasil pemeriksaan aplikasi dapat dilihat melalui kode pelacakan.</p></article></div><div className={s.announcement}><strong>Bagikan pengalaman Anda</strong><p>Survei tersedia setelah penyelesaian magang.</p><Link className={s.secondary} href='/survey'>Informasi survei</Link></div><details className={s.faq}><summary>Materi poster layanan</summary><p>Poster resmi belum dipasang. Area ini disiapkan untuk materi dari pengelola agar informasi yang ditampilkan sesuai dengan layanan instansi.</p></details></section>;}
