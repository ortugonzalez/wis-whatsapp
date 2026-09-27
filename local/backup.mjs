import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const source = resolve(process.env.WIS_DB_PATH || '.local/wis.sqlite');
mkdirSync('.local/backups', { recursive: true, mode: 0o700 });
const target = resolve('.local/backups', `wis-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, target); console.log('Backup SQLite completado en .local/backups/. La sesión requiere copia separada con el worker detenido.'); } finally { db.close(); }
