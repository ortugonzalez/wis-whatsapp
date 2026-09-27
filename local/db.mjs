import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const stateDir=resolve(root,'.local');
export function openDatabase(path=process.env.WIS_DB_PATH??resolve(stateDir,'wis.sqlite')) {
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const database=new DatabaseSync(path);database.exec(readFileSync(resolve(root,'local/schema.sql'),'utf8'));
 database.prepare("INSERT OR IGNORE INTO connections(id,status,updated_at) VALUES('wis-5679','disconnected',?)").run(new Date().toISOString());
 return database;
}
export const db=openDatabase();
export const getDb=()=>db;
export function transaction(database,fn){database.exec('BEGIN IMMEDIATE');try{const value=fn();database.exec('COMMIT');return value;}catch(error){database.exec('ROLLBACK');throw error;}}
