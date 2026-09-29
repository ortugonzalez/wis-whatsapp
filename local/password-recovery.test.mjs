import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {randomBytes,scryptSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');
const {createPasswordRecoverySender,validRecoveryEmail}=await import('./password-recovery.mjs');

test('recovery button has a clear touch target and announces delivery state accessibly',()=>{
 const ui=readFileSync(new URL('./public/password-recovery.js',import.meta.url),'utf8');
 assert.match(ui,/button\.className='btn'/);
 assert.match(ui,/min-height:48px/);
 assert.match(ui,/aria-label','Enviar enlace para recuperar la contraseña'/);
 assert.match(ui,/aria-live','polite'/);
});

test('Gmail recovery sender requires a valid address and an app password without logging it',()=>{
 assert.equal(validRecoveryEmail('ortugonzalezz@gmail.com'),true);assert.equal(validRecoveryEmail('not-an-email'),false);
 assert.equal(createPasswordRecoverySender({WIS_ADMIN_RECOVERY_EMAIL:'ortugonzalezz@gmail.com'}),null);
 const sender=createPasswordRecoverySender({WIS_ADMIN_RECOVERY_EMAIL:'ortugonzalezz@gmail.com',WIS_SMTP_PASS:'not-a-real-secret'});assert.equal(typeof sender,'function');sender.transport?.close?.();
});

test('SMTP port 587 refuses to authenticate or deliver if STARTTLS is unavailable',async()=>{
 let received='';
 const server=net.createServer(socket=>{
  socket.write('220 test.local ESMTP ready\r\n');
  socket.on('data',chunk=>{
   received+=chunk.toString('utf8');
   if(/^EHLO /m.test(received)&&!received.includes('250-test.local'))socket.write('250-test.local\r\n250 SIZE 1000000\r\n');
   else if(/^QUIT/m.test(received))socket.end('221 bye\r\n');
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(587,'127.0.0.1',resolve);});
 try{
  const sender=createPasswordRecoverySender({WIS_ADMIN_RECOVERY_EMAIL:'ortugonzalezz@gmail.com',WIS_SMTP_HOST:'127.0.0.1',WIS_SMTP_PORT:'587',WIS_SMTP_USER:'user@example.com',WIS_SMTP_PASS:'fake-test-secret',WIS_SMTP_FROM:'ortugonzalezz@gmail.com'});
  assert.equal(typeof sender,'function');
  await assert.rejects(sender({to:'ortugonzalezz@gmail.com',url:'https://wis.example/#reset/test'}));
  assert.match(received,/^EHLO /m);assert.doesNotMatch(received,/^AUTH /m);assert.doesNotMatch(received,/^MAIL FROM/m);assert.doesNotMatch(received,/fake-test-secret/);
 }finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
});

async function setup(options={}){
 const database=openDatabase(':memory:'),salt=randomBytes(16).toString('hex'),oldPassword=randomBytes(24).toString('hex');
 database.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(`${salt}:${scryptSync(oldPassword,salt,64).toString('hex')}`);
 const server=makeServer(database,{adminUsername:'ortu',adminRecoveryEmail:'ortugonzalezz@gmail.com',...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,origin=base)=>{const response=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {response,json:await response.json()};};
 return {database,server,base,call,oldPassword};
}

test('password recovery sends one opaque single-use link and invalidates existing sessions after user-set password',async()=>{
 let mail;const ctx=await setup({sendRecoveryEmail:async value=>{mail=value;}});
 try{
  const config=await fetch(ctx.base+'/api/login-config').then(response=>response.json());assert.deepEqual(config.data,{username:'ortu',password_recovery_available:true});assert.equal(JSON.stringify(config).includes('ortugonzalezz'),false);
  assert.equal((await ctx.call('/api/forgot-password',{},'https://other.example')).response.status,403);
  const issued=await ctx.call('/api/forgot-password',{});assert.equal(issued.response.status,202);assert.equal(issued.json.data.accepted,true);assert.equal(mail.to,'ortugonzalezz@gmail.com');assert.match(mail.url,/^http:\/\/127\.0\.0\.1:\d+\/#reset\/[A-Za-z0-9_-]{40,60}$/);
  const token=new URL(mail.url).hash.split('/')[1];assert.ok(token);assert.notEqual(ctx.database.prepare('SELECT token_hash FROM password_reset_tokens').get().token_hash,token);
  const session=randomBytes(32).toString('base64url');ctx.database.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').run((await import('node:crypto')).createHash('sha256').update(session).digest('hex'),new Date(Date.now()+60000).toISOString());
  const weak=await ctx.call('/api/reset-password',{token,new_password:'too-short'});assert.equal(weak.response.status,400);assert.equal(weak.json.error,'weak_password');
  const reset=await ctx.call('/api/reset-password',{token,new_password:'Nueva clave segura 2026!'});assert.equal(reset.response.status,200);assert.deepEqual(reset.json.data,{password_changed:true,authenticated:false});assert.equal(reset.response.headers.get('set-cookie').includes('Max-Age=0'),true);assert.equal(ctx.database.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
  assert.equal((await ctx.call('/api/reset-password',{token,new_password:'Otra clave segura 2026!'})).json.error,'invalid_reset_token');
  assert.equal((await ctx.call('/api/login',{username:'ortu',password:ctx.oldPassword})).response.status,401);
  assert.equal((await ctx.call('/api/login',{username:'ortu',password:'Nueva clave segura 2026!'})).response.status,200);
  assert.equal(ctx.database.prepare('SELECT count(*) AS n FROM audit WHERE action LIKE ?').get('password_recovery.%').n,2);
 }finally{ctx.server.close();ctx.database.close();}
});

test('password recovery stays unavailable without SMTP and never stores reset tokens when delivery fails',async()=>{
 const unavailable=await setup({adminRecoveryEmail:'ortugonzalezz@gmail.com',sendRecoveryEmail:null});
 try{const config=await fetch(unavailable.base+'/api/login-config').then(response=>response.json());assert.equal(config.data.password_recovery_available,false);const result=await unavailable.call('/api/forgot-password',{});assert.equal(result.response.status,503);assert.equal(result.json.error,'recovery_unavailable');assert.equal(unavailable.database.prepare('SELECT count(*) AS n FROM password_reset_tokens').get().n,0);}finally{unavailable.server.close();unavailable.database.close();}
 let failDelivery=true;const failed=await setup({sendRecoveryEmail:async()=>{if(failDelivery)throw Error('provider secret must never be logged');}});
 try{const result=await failed.call('/api/forgot-password',{});assert.equal(result.response.status,503);assert.equal(result.json.error,'recovery_unavailable');assert.equal(failed.database.prepare('SELECT count(*) AS n FROM password_reset_tokens').get().n,0);assert.equal(failed.database.prepare('SELECT count(*) AS n FROM password_reset_attempts').get().n,0,'failed SMTP deliveries must not consume the user recovery limit');failDelivery=false;assert.equal((await failed.call('/api/forgot-password',{})).response.status,202,'the user can retry once delivery is fixed');}finally{failed.server.close();failed.database.close();}
});

test('password recovery rate limits requests without returning recipient details',async()=>{
 let deliveries=0;const ctx=await setup({sendRecoveryEmail:async()=>{deliveries++;}});
 try{
  for(let i=0;i<3;i++)assert.equal((await ctx.call('/api/forgot-password',{})).response.status,202);
  const blocked=await ctx.call('/api/forgot-password',{});assert.equal(blocked.response.status,429);assert.equal(blocked.json.error,'recovery_rate_limited');assert.equal(deliveries,3);
  assert.equal(ctx.database.prepare('SELECT count(*) AS n FROM password_reset_attempts').get().n,3);
 }finally{ctx.server.close();ctx.database.close();}
});
