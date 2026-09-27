import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Run only against this project's local Supabase. Never accepts remote URLs.
const raw = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore','pipe','pipe'] });
const status = JSON.parse(raw.slice(raw.indexOf('{')));
const url = status.API_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname) || new URL(url).port !== '55321') throw new Error('Refusing non-WIS-local Supabase endpoint');
const service = status.SERVICE_ROLE_KEY;
const anon = status.ANON_KEY;
if (!service || !anon) throw new Error('Supabase status must provide local API keys');
mkdirSync('.local', { recursive: true });
function protect(path) {
  if (process.platform !== 'win32') return;
  const sidOutput = execFileSync('whoami', ['/user','/fo','csv','/nh'], { encoding: 'utf8' });
  const sid = sidOutput.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw new Error('Cannot determine local Windows owner SID');
  const permission=statSync(path).isDirectory()?'(OI)(CI)F':'F';
  execFileSync('icacls', [resolve(path), '/inheritance:r', '/grant:r', `*${sid}:${permission}`, `*S-1-5-18:${permission}`], { stdio: 'ignore' });
}
protect('.local');
const credentialsPath = '.local/credentials.json';
const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : { email: 'admin@wis.local', password: randomBytes(24).toString('base64url') };
writeFileSync(credentialsPath, JSON.stringify(credentials,null,2), { mode: 0o600 });
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
function check(result) { if (result.error) throw result.error; return result.data; }
const { users } = check(await db.auth.admin.listUsers());
let user = users.find(u => u.email === credentials.email);
if (!user) user = check(await db.auth.admin.createUser({ ...credentials, email_confirm: true })).user;
const profile = check(await db.from('profiles').upsert({ email: credentials.email, user_id: user.id, slug: 'wis-admin', first_name: 'WIS', last_name: 'Administrador', role: 'admin', is_active: true }, { onConflict: 'email' }).select('id').single());
const sector = check(await db.from('sectors').select('id').eq('slug','wis-5679').single());
check(await db.from('sector_memberships').upsert({ profile_id: profile.id, sector_id: sector.id }, { onConflict: 'profile_id,sector_id' }));
writeFileSync(credentialsPath, JSON.stringify(credentials,null,2), { mode: 0o600 });
writeFileSync('.env.local', `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nNEXT_PUBLIC_SITE_URL=http://localhost:3010\nWIS_OUTBOUND_ENABLED=false\n`, { mode: 0o600 });
const workerEnv = 'workers/whatsapp-baileys/.env';
if (!existsSync(workerEnv)) writeFileSync(workerEnv, `SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nSECTOR_SLUG=wis-5679\nWHATSAPP_AUTH_DIR=${resolve('.local/baileys-auth').replaceAll('\\','/')}\nBAILEYS_LOG_LEVEL=silent\nWIS_OUTBOUND_ENABLED=false\n`, { mode: 0o600 });
protect('.env.local');
protect(workerEnv);
console.log('Administrador y entorno local preparados. Credenciales: .local/credentials.json (no se imprimen).');
