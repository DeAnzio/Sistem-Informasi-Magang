import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const pin = randomBytes(5).toString('hex');
console.log(`\nVersi lokal: http://127.0.0.1:3001/preview\nLogin petugas: http://127.0.0.1:3001/preview/admin\nKata sandi petugas lokal: ${pin}\nData tersimpan di .local-preview-data. Tidak memakai Supabase produksi.\n`);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3001'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, LOCAL_PREVIEW: '1', LOCAL_PREVIEW_PIN: pin, LOCAL_PREVIEW_SESSION: randomBytes(32).toString('hex'), SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-only' } });
child.on('exit', code => process.exit(code ?? 1));
