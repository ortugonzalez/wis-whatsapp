import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const source = resolve(root,process.env.WIS_DB_PATH || '.local/wis.sqlite');
const backups=resolve(root,'.local/backups');
mkdirSync(backups, { recursive: true, mode: 0o700 });
const filename=`wis-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.sqlite`;
const target = resolve(backups,filename);
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, target); console.log(JSON.stringify({backup:filename,scope:'sqlite_only',session_included:false,media_included:false,avatars_included:false})); } finally { db.close(); }
