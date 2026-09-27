import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../.local', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (process.platform === 'win32') {
  const identity = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.stdout.match(/S-1-5-[0-9-]+/)?.[0];
  if (!sid) throw Error('No se pudo resolver el propietario local.');
  const acl = spawnSync('icacls', [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'ignore' });
  if (acl.status !== 0) throw Error('No se pudo proteger .local.');
}
await import('./db.mjs');
const { bootstrap } = await import('./server.mjs');
await bootstrap();
console.log('SQLite inicializado y carpeta privada protegida. Ejecutá npm start.');
