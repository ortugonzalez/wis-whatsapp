import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,scryptSync} from 'node:crypto';
import {deploymentSpec} from '../scripts/provision-workspace.mjs';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(suffix='5679'){
 const db=openDatabase(':memory:'),password=randomBytes(20).toString('hex'),salt=randomBytes(16).toString('hex');
 db.prepare("INSERT INTO settings VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
 const server=makeServer(db,{workspaceEnvironment:{WIS_EXPECTED_PHONE_SUFFIX:suffix},sendRecoveryEmail:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const login=async pass=>fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:pass})});const session=await login(password),cookie=session.headers.get('set-cookie').split(';')[0];
 const call=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
 return {db,password,login,call,base,cookie,close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
test('dedicated workspaces keep data isolated, require an administrator and validate branding',async()=>{
 const a=await fixture(),b=await fixture('4321');try{
 assert.equal((await fetch(a.base+'/api/v1/workspace')).status,401);
 assert.equal((await b.call('/api/v1/workspace','GET',null,{Cookie:a.cookie})).status,401);
 const token='wis_'+randomBytes(32).toString('base64url');a.db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?,NULL)').run('reader','reader',digest(token),'["read"]',new Date().toISOString());
 assert.equal((await a.call('/api/v1/workspace','GET',null,{Authorization:'Bearer '+token})).status,403);
 assert.equal((await a.call('/api/v1/workspace','PATCH',{name:'Client A',connection_name:'Support',support_email:'',outbound_enabled:true})).status,400);
 assert.equal((await a.call('/api/v1/workspace','PATCH',{name:'Client A',connection_name:'Support',support_email:''})).status,200);
 assert.equal((await (await a.call('/api/v1/workspace')).json()).data.profile.name,'Client A');
 assert.equal((await (await b.call('/api/v1/workspace')).json()).data.profile.name,'WIS');
 assert.equal((await b.call('/api/whatsapp/identity','POST',{phone_e164:'+5491100004321'})).status,200);
 assert.equal((await a.call('/api/whatsapp/identity','POST',{phone_e164:'+5491100004321'})).status,400);
 b.db.prepare("UPDATE connections SET status='connected',phone='+5491100004321' WHERE id='wis-5679'").run();
 assert.equal((await b.call('/api/whatsapp/identity','POST',{phone_e164:'+5492200004321'})).status,409);
 }finally{await a.close();await b.close();}
});
test('password change verifies current secret, revokes other sessions and reset links but preserves WhatsApp and API tokens',async()=>{
 const a=await fixture();try{
 const other=await a.login(a.password),otherCookie=other.headers.get('set-cookie').split(';')[0];
 const token='wis_'+randomBytes(32).toString('base64url');a.db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?,NULL)').run('reader','reader',digest(token),'["read"]',new Date().toISOString());
 a.db.prepare("INSERT INTO password_reset_tokens VALUES('reset','hash',?,NULL,?)").run(new Date(Date.now()+60000).toISOString(),new Date().toISOString());
 a.db.prepare("UPDATE connections SET status='connected',phone='+5491100005679' WHERE id='wis-5679'").run();
 assert.equal((await a.call('/api/v1/password','POST',{current_password:a.password,new_password:'1234'})).status,400);
 assert.equal((await a.call('/api/v1/password','POST',{current_password:'wrong',new_password:'a-strong-password-5678'})).status,401);
 assert.equal((await a.call('/api/v1/password','POST',{current_password:a.password,new_password:'a-strong-password-5678'},{Authorization:'Bearer '+token})).status,403);
 assert.equal((await a.call('/api/v1/password','POST',{current_password:a.password,new_password:'a-strong-password-5678'})).status,200);
 assert.equal((await a.call('/api/v1/workspace','GET',null,{Cookie:otherCookie})).status,401);
 assert.equal((await a.call('/api/v1/workspace')).status,200);
 assert.equal((await a.login(a.password)).status,401);assert.equal((await a.login('a-strong-password-5678')).status,200);
 assert.equal(a.db.prepare('SELECT count(*) AS n FROM password_reset_tokens').get().n,0);
 assert.equal(a.db.prepare('SELECT status,command FROM connections').get().status,'connected');
 assert.equal(a.db.prepare('SELECT command FROM connections').get().command,null);
 assert.equal(a.db.prepare('SELECT revoked_at FROM tokens').get().revoked_at,null);
 assert.doesNotMatch(JSON.stringify(a.db.prepare('SELECT * FROM audit').all()),/a-strong-password|current_password/);
 }finally{await a.close();}
});
test('provisioning uses separate volumes, no inherited secrets and no published host ports',()=>{
 const a=deploymentSpec({slug:'client-a',name:'Client A',suffix:'1234',domain:'a.example.com'},'/source');
 const b=deploymentSpec({slug:'client-b',name:'Client B',suffix:'9876',domain:'b.example.com'},'/source');
 assert.notEqual(a.volumes.data.name,b.volumes.data.name);assert.equal(a.services.panel.ports,undefined);
 assert.equal(a.services.panel.environment.WIS_WORKER_DISABLED,'true');assert.equal(a.services.panel.environment.WIS_OUTBOUND_ENABLED,'false');
 assert.doesNotMatch(JSON.stringify(a),/SMTP_PASS|admin_password|baileys-auth/);
 assert.throws(()=>deploymentSpec({slug:'../escape',name:'Bad',suffix:'1234',domain:'a.example.com'},'/source'));
 assert.throws(()=>deploymentSpec({slug:'client-a',name:'Bad',suffix:'1234',domain:'https://a.example.com'},'/source'));
});
