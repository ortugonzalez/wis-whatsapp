import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
// Offline PostgreSQL engine: validates SQL and RLS contracts. It does not replace
// an integration test of Supabase Auth, Storage or Realtime in Docker.
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user)$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create publication supabase_realtime;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant all on all tables in schema auth,storage to service_role;
`);
const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  try { await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8')); }
  catch (error) { console.error(`FAILED ${file}: ${error.message}`); await db.close(); process.exit(1); }
}
await db.exec(readFileSync('supabase/seed.sql','utf8'));
await db.exec(readFileSync('examples/api-database-test.sql','utf8').replace(/^\\.*$/gm,''));
await db.exec('begin');
const [user,profile,a,b] = Array.from({length:4},randomUUID);
await db.query('insert into auth.users(id,email) values($1,$2)',[user,'offline@wis.test']);
await db.query("insert into profiles(id,user_id,email,slug,role) values($1,$2,'offline@wis.test','offline','agent')",[profile,user]);
await db.query("insert into sectors(id,slug,display_name) values($1,'offline-a','A'),($2,'offline-b','B')",[a,b]);
await db.query('insert into sector_memberships(profile_id,sector_id) values($1,$2)',[profile,a]);
await db.query("insert into storage.objects(bucket_id,name) values('whatsapp-media',$1),('whatsapp-media',$2)",[`${a}/a.pdf`,`${b}/b.pdf`]);
await db.exec('grant select,insert,update,delete on storage.objects to authenticated; set local role authenticated;');
await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
assert.equal((await db.query('select * from storage.objects')).rows.length,1,'cross-sector read exposed');
assert.equal((await db.query("update storage.objects set name=name where name=$1 returning id",[`${b}/b.pdf`])).rows.length,0,'cross-sector update exposed');
assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0,'operator delete exposed');
for(const path of [`outbound/${b}/${profile}/x.pdf`,`${b}/x.pdf`,`outbound/${a}/${profile}/../x.pdf`]) {
  await db.exec('savepoint denied');
  let denied=false;
  try { await db.query("insert into storage.objects(bucket_id,name) values('whatsapp-media',$1)",[path]); } catch { denied=true; }
  await db.exec('rollback to savepoint denied');
  assert.ok(denied,'cross-sector/malformed upload accepted');
}
await db.query("insert into storage.objects(bucket_id,name) values('whatsapp-media',$1)",[`outbound/${a}/${profile}/ok.pdf`]);
await db.exec('reset role');
await db.query("insert into contacts(sector_id,phone_e164,consent_at,consent_source,consent_scope) values($1,'+12025550125',now(),'offline','test')",[a]);
await db.exec('savepoint media');
let crossQueueDenied=false;
try { await db.query("insert into whatsapp_outbox(sector_id,to_e164,type,media_bucket_path) values($1,'+12025550125','document',$2)",[a,`${b}/b.pdf`]); }
catch(error) { crossQueueDenied=error.message.includes('media_sector_mismatch'); }
assert.ok(crossQueueDenied,'cross-sector worker media enqueue accepted');
await db.exec('rollback');
console.log(`${files.length} migrations + WIS seed + transactional SQL regression: PASS (offline PostgreSQL, Supabase services not tested)`);
console.log('Storage two-sector RLS + cross-sector queue rejection: PASS');
await db.close();
