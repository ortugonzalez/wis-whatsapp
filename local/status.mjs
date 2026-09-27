// Local diagnostics deliberately exclude identities, QR, credentials and message bodies.
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const db=new DatabaseSync(fileURLToPath(new URL('../.local/wis.sqlite',import.meta.url)),{readOnly:true});
try{
 const connection=db.prepare('SELECT status,lease_expires_at,last_error FROM connections LIMIT 1').get();
 const counts={};for(const table of ['contacts','conversations','messages','operations','snapshots','events'])counts[table]=db.prepare('SELECT count(*) n FROM '+table).get().n;
 let http=false;try{const response=await fetch('http://127.0.0.1:3010/api/session',{signal:AbortSignal.timeout(3000)});http=response.ok;}catch{}
 console.log(JSON.stringify({http_available:http,connection_status:connection?.status,worker_lease_current:Boolean(connection?.lease_expires_at&&Date.parse(connection.lease_expires_at)>Date.now()),last_error:connection?.last_error,counts,snapshots:db.prepare('SELECT kind,count(*) count FROM snapshots GROUP BY kind').all(),read_commands:db.prepare('SELECT status,count(*) count FROM read_commands GROUP BY status').all()},null,2));
}finally{db.close();}
