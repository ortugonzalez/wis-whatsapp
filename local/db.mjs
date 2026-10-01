import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SESSION_IDLE_TTL_MS} from './session-policy.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const stateDir=resolve(root,'.local');
export function openDatabase(path=process.env.WIS_DB_PATH??resolve(stateDir,'wis.sqlite')) {
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const database=new DatabaseSync(path);database.exec(readFileSync(resolve(root,'local/schema.sql'),'utf8'));
 database.exec('BEGIN IMMEDIATE');
 try {
  const sessionColumns=database.prepare('PRAGMA table_info(sessions)').all();
  if(!sessionColumns.some(column=>column.name==='created_at'))database.exec('ALTER TABLE sessions ADD COLUMN created_at TEXT');
  const legacySessions=database.prepare('SELECT token_hash,expires_at FROM sessions WHERE created_at IS NULL').all();
  const setSessionCreatedAt=database.prepare('UPDATE sessions SET created_at=? WHERE token_hash=? AND created_at IS NULL');
  for(const session of legacySessions){const expiry=Date.parse(session.expires_at),created=Number.isFinite(expiry)?expiry-SESSION_IDLE_TTL_MS:Date.now();setSessionCreatedAt.run(new Date(created).toISOString(),session.token_hash);}
  database.exec('COMMIT');
 } catch(error) {database.exec('ROLLBACK');database.close();throw error;}
 database.prepare("INSERT OR IGNORE INTO connections(id,status,updated_at) VALUES('wis-5679','disconnected',?)").run(new Date().toISOString());
 return database;
}
export const db=openDatabase();
export const getDb=()=>db;
export function transaction(database,fn){database.exec('BEGIN IMMEDIATE');try{const value=fn();database.exec('COMMIT');return value;}catch(error){database.exec('ROLLBACK');throw error;}}
