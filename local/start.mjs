import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
try { process.loadEnvFile(resolve(root, '.env.local')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await import('./setup.mjs');
const children = ['server.mjs', 'worker.mjs'].map(file => spawn(process.execPath, [resolve(root, 'local', file)], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true }));
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); setTimeout(() => process.exit(code), 1000).unref(); }
for (const child of children) child.on('exit', code => { if (!stopping) stop(code || 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
