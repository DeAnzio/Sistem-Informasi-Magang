 'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
import s from './preview.module.css';
export function PreviewCaptcha(){
 const container=useRef<HTMLDivElement>(null);const widget=useRef<number|null>(null);
 const [token,setToken]=useState('');const [error,setError]=useState('');
 useEffect(()=>{let attempts=0;let alive=true;
 const timer=window.setInterval(()=>{
  if(widget.current!==null){window.clearInterval(timer);return;}
  if(!window.grecaptcha?.render||!container.current){if(++attempts>100){setError('reCAPTCHA tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.');window.clearInterval(timer);}return;}
  try{widget.current=window.grecaptcha.render(container.current,{sitekey:'6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',callback:value=>{if(alive){setToken(value);setError('');}},'expired-callback':()=>{if(alive){setToken('');setError('Verifikasi kedaluwarsa. Centang ulang Saya bukan robot.');}},'error-callback':()=>{if(alive){setToken('');setError('reCAPTCHA gagal dimuat. Periksa koneksi dan muat ulang halaman.');}}});}catch{setError('reCAPTCHA gagal ditampilkan. Muat ulang halaman untuk mencoba kembali.');}window.clearInterval(timer);
 },100);return()=>{alive=false;window.clearInterval(timer);};},[]);
 return <section className={s.captchaPanel} aria-label='Verifikasi Saya bukan robot'><h3>Saya bukan robot</h3><p className={s.caption}>Mode uji lokal menggunakan kunci uji resmi Google. Ini menguji alur formulir, bukan perlindungan bot produksi.</p><Script src='https://www.google.com/recaptcha/api.js?render=explicit&hl=id' strategy='afterInteractive' onError={()=>setError('reCAPTCHA tidak dapat dimuat. Periksa koneksi internet.')}/><div ref={container}/><input type='hidden' name='recaptchaToken' value={token}/>{error&&<p role='alert' className={s.error}>{error}</p>}<p className={s.caption}><a href='https://policies.google.com/privacy' target='_blank' rel='noreferrer'>Privasi</a> dan <a href='https://policies.google.com/terms' target='_blank' rel='noreferrer'>Persyaratan Google</a> berlaku.</p></section>;
}
