'use client';

import {useEffect,useState} from 'react';
import s from './preview.module.css';

// Mount only while a request is pending so every request gets a fresh delay.
export function DelayedLoading({label}:{label:string}){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const timer=setTimeout(()=>setVisible(true),450);
    return()=>clearTimeout(timer);
  },[]);

  return <div role='status' aria-live='polite' aria-atomic='true'>
    {visible&&<div className={s.loadingNotice}>
      <span className={s.loadingSpinner} aria-hidden='true'/>
      <div><strong>{label}</strong><span>Mohon tunggu sebentar.</span></div>
    </div>}
  </div>;
}
