import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {db,root,stateDir,transaction} from './db.mjs';
const now=()=>new Date().toISOString();
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const scopes=['read','send','contacts:write','webhooks:write'];
const eligible=c=>Boolean(c?.consent_at&&c.consent_source?.trim()&&c.consent_scope?.trim()&&!c.opted_out_at);
const phone=x=>typeof x==='string'&&/^\+[1-9]\d{6,14}$/.test(x);
function mediaMatches(data,mime){const head=data.subarray(0,16);return mime==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:mime==='image/png'?head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP':mime==='audio/ogg'?head.toString('ascii',0,4)==='OggS':mime==='audio/mpeg'?head.toString('ascii',0,3)==='ID3'||head[0]===255&&(head[1]&224)===224:mime==='audio/mp4'?head.toString('ascii',4,8)==='ftyp':mime==='application/pdf'?head.toString('ascii',0,5)==='%PDF-':false;}
export async function bootstrap(database=db,directory=stateDir){
 if(database.prepare("SELECT value FROM settings WHERE key='admin_password'").get())return;
 let password=randomBytes(20).toString('base64url');const salt=randomBytes(16).toString('hex');
 await mkdir(directory,{recursive:true,mode:0o700});
 try{await writeFile(resolve(directory,'admin-access.txt'),'WIS local administrator\nPassword: '+password+'\n',{mode:0o600,flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const existing=await readFile(resolve(directory,'admin-access.txt'),'utf8');const match=/^Password: ([A-Za-z0-9_-]{20,})$/m.exec(existing);if(!match)throw Error('Existing administrator file needs manual recovery');password=match[1];}
 database.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?)").run(salt+':'+scryptSync(password,salt,64).toString('hex'));
}
async function jsonBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>15*1024*1024)fail(413,'body_too_large');}try{const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{fail(400,'invalid_json');}}
function cleanConnection(row){const {qr_payload,lease_owner,...safe}=row;return {...safe,identity_verified:Boolean(row.phone&&row.expected_phone_e164&&row.phone.replace(/\D/g,'')===row.expected_phone_e164.replace(/\D/g,'')),outbound_enabled:process.env.WIS_OUTBOUND_ENABLED==='true'};}
export function makeServer(database=db,options={}){
 const directory=options.stateDir??stateDir;const failures=new Map();
 const audit=(action,actor,id)=>database.prepare('INSERT INTO audit(action,actor,resource_id,created_at) VALUES(?,?,?,?)').run(action,actor,id??null,now());
 return createServer(async(req,res)=>{
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({data}));};
  try{
   const host=req.headers.host??'';if(!new RegExp('^(127\\.0\\.0\\.1|localhost):'+req.socket.localPort+'$').test(host))fail(403,'invalid_host');
   const url=new URL(req.url,'http://'+host),path=url.pathname,method=req.method;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
   let actor=null;const bearer=req.headers.authorization;
   if(bearer){const match=/^Bearer (wis_[A-Za-z0-9_-]{40,})$/.exec(bearer);if(!match)fail(401,'invalid_token');const token=database.prepare('SELECT * FROM tokens WHERE token_hash=? AND revoked_at IS NULL').get(hash(match[1]));if(!token)fail(401,'invalid_token');actor={id:token.id,admin:false,scopes:JSON.parse(token.scopes)};}
   else {const cookie=/(?:^|;\s*)wis_session=([^;]+)/.exec(req.headers.cookie??'');if(cookie){const session=database.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(cookie[1]),now());if(session)actor={id:'admin',admin:true,scopes};}}
   if(method!=='GET'&&method!=='HEAD'&&!bearer&&req.headers.origin!=='http://'+host)fail(403,'origin_required');
   const auth=(scope='read',admin=false)=>{if(!actor)fail(401,'authentication_required');if(admin&&!actor.admin||scope&&!actor.scopes.includes(scope))fail(403,'insufficient_scope');};
   if(['/api/session','/api/me'].includes(path)&&method==='GET')return send({authenticated:Boolean(actor),admin:Boolean(actor?.admin)});
   if(path==='/api/login'&&method==='POST'){
    const key=req.socket.remoteAddress;const attempt=failures.get(key);if(attempt?.count>=5&&attempt.until>Date.now())fail(429,'login_rate_limited');
    const b=await jsonBody(req);const stored=database.prepare("SELECT value FROM settings WHERE key='admin_password'").get()?.value;if(!stored)fail(503,'bootstrap_required');
    const [salt,value]=stored.split(':');const valid=typeof b.password==='string'&&b.password.length<512&&timingSafeEqual(scryptSync(b.password,salt,64),Buffer.from(value,'hex'));
    if(!valid){failures.set(key,{count:attempt?.until>Date.now()?attempt.count+1:1,until:Date.now()+900000});fail(401,'invalid_credentials');}
    failures.delete(key);const token=randomBytes(32).toString('base64url');database.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').run(hash(token),new Date(Date.now()+12*3600000).toISOString());res.setHeader('Set-Cookie','wis_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200');audit('login','admin');return send({authenticated:true,admin:true});
   }
   if(path==='/api/logout'&&method==='POST'){auth();const cookie=/(?:^|;\s*)wis_session=([^;]+)/.exec(req.headers.cookie??'');if(cookie)database.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookie[1]));res.setHeader('Set-Cookie','wis_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send({authenticated:false});}
   if(path.startsWith('/api/whatsapp/')){
    auth('read',true);const connection=database.prepare("SELECT * FROM connections WHERE id='wis-5679'").get();
    if(path==='/api/whatsapp/connection'&&method==='GET')return send(cleanConnection(connection));
    if(path==='/api/whatsapp/qr'&&method==='GET'){if(!connection.qr_payload||!connection.qr_expires_at||connection.qr_expires_at<=now())fail(404,'qr_unavailable');const QR=await import('qrcode');const svg=await QR.toString(connection.qr_payload,{type:'svg',margin:2});res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});return res.end(svg);}
    if(method==='POST'&&['connect','disconnect','logout'].includes(path.split('/').pop())){const command=path.split('/').pop();database.prepare("UPDATE connections SET command=?,updated_at=? WHERE id='wis-5679'").run(command,now());audit('connection.'+command,actor.id);return send({command},202);}
    if(path==='/api/whatsapp/identity'&&method==='POST'){const b=await jsonBody(req);if(!phone(b.phone_e164)||!b.phone_e164.endsWith('5679'))fail(400,'expected_line_5679_required');if(connection.status==='connected'&&connection.phone?.replace(/\D/g,'')!==b.phone_e164.replace(/\D/g,''))fail(409,'connected_identity_mismatch');database.prepare("UPDATE connections SET expected_phone_e164=?,updated_at=? WHERE id='wis-5679'").run(b.phone_e164,now());audit('connection.identity',actor.id);return send({expected_phone_e164:b.phone_e164});}
    fail(404,'not_found');
   }
   if(path.startsWith('/api/v1/')){
    auth(null);const resource=path.slice('/api/v1/'.length);if(method==='GET'&&!['tokens','webhooks'].includes(resource))auth('read');const b=method==='GET'||method==='DELETE'?{}:await jsonBody(req);
    if(resource==='connections'&&method==='GET')return send(database.prepare('SELECT * FROM connections').all().map(cleanConnection));
    if(resource==='capabilities'&&method==='GET')return send(JSON.parse(await readFile(resolve(root,'public/whapi-capabilities.json'),'utf8')));
    if(resource==='openapi'&&method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await readFile(resolve(root,'docs/api.openapi.json')));}
    if(resource==='contacts'){
     if(method==='GET')return send(database.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT 500').all());
     auth('contacts:write');if(!['POST','PATCH'].includes(method))fail(405,'method_not_allowed');
     const old=method==='PATCH'?database.prepare('SELECT * FROM contacts WHERE id=?').get(String(b.id)):null;if(method==='PATCH'&&!old)fail(404,'not_found');
     const values={...old,...b};if(!phone(values.phone_e164))fail(400,'invalid_e164');
     for(const k of ['consent_at','opted_out_at'])if(values[k]&&(typeof values[k]!=='string'||!Number.isFinite(Date.parse(values[k]))||Date.parse(values[k])>Date.now()+60000))fail(400,'invalid_date');
     if(old?.opted_out_at&&'opted_out_at'in b&&b.opted_out_at!==old.opted_out_at)fail(409,'optout_removal_requires_review');
     if(values.consent_at&&(typeof values.consent_source!=='string'||!values.consent_source.trim()||typeof values.consent_scope!=='string'||!values.consent_scope.trim()))fail(400,'consent_evidence_required');
     for(const k of ['display_name','consent_source','consent_scope'])if(values[k]!=null&&(typeof values[k]!=='string'||values[k].length>1000))fail(400,'invalid_contact');
     const id=old?.id??randomUUID();database.prepare('INSERT INTO contacts(id,phone_e164,display_name,consent_at,consent_source,consent_scope,opted_out_at,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone_e164=excluded.phone_e164,display_name=excluded.display_name,consent_at=excluded.consent_at,consent_source=excluded.consent_source,consent_scope=excluded.consent_scope,opted_out_at=excluded.opted_out_at').run(id,values.phone_e164,values.display_name??'',values.consent_at??null,values.consent_source??null,values.consent_scope??null,values.opted_out_at??null,old?.created_at??now());audit('contact.'+method,actor.id,id);return send(database.prepare('SELECT * FROM contacts WHERE id=?').get(id),method==='POST'?201:200);
    }
    if(resource==='conversations'&&method==='GET')return send(database.prepare('SELECT * FROM conversations ORDER BY last_message_at DESC LIMIT 100').all());
    if(resource==='messages'&&method==='GET')return send(url.searchParams.has('conversation_id')?database.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 200').all(url.searchParams.get('conversation_id')):database.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 100').all());
    if(resource==='operations'&&method==='GET'){const rows=database.prepare('SELECT o.*,m.delivery_status FROM operations o LEFT JOIN messages m ON m.id=o.message_id ORDER BY o.created_at DESC LIMIT 100').all();return send(rows.filter(x=>!url.searchParams.has('id')||x.id===url.searchParams.get('id')).map(x=>({...x,message:{delivery_status:x.delivery_status}})));}
    if(resource==='messages'&&method==='POST'){
     auth('send');const key=req.headers['idempotency-key'];if(typeof key!=='string'||! /^[\x21-\x7e]{1,128}$/.test(key))fail(400,'idempotency_key_required');if(!phone(b.to))fail(400,'invalid_e164');if(!['text','image','audio','document'].includes(b.type??'text'))fail(422,'unsupported_type');if((b.type??'text')==='text'&&(typeof b.body!=='string'||!b.body.trim()||b.body.length>10000))fail(400,'invalid_body');
     const payload={to:b.to,type:b.type??'text',body:b.body??null,media_path:b.media_path??null};if(payload.body!==null&&(typeof payload.body!=='string'||payload.body.length>10000))fail(400,'invalid_body');const fingerprint=hash(JSON.stringify(payload));
     const previous=database.prepare('SELECT * FROM operations WHERE idempotency_key=?').get(key);if(previous){if(previous.request_hash!==fingerprint)fail(409,'idempotency_conflict');return send(previous);}
     if(process.env.WIS_OUTBOUND_ENABLED!=='true')fail(409,'outbound_disabled');
     const c=database.prepare('SELECT * FROM contacts WHERE phone_e164=?').get(b.to);if(!eligible(c))fail(403,c?.opted_out_at?'contact_opted_out':'contact_consent_required');if(b.purpose&&b.purpose!=='transactional')fail(409,'campaigns_disabled');
     if(payload.type!=='text'){if(typeof payload.media_path!=='string'||! /^[0-9a-f-]{36}\.(jpg|png|webp|ogg|mp3|m4a|pdf)$/.test(payload.media_path))fail(400,'invalid_media_path');const ext=extname(payload.media_path);if(payload.type==='image'&&!['.jpg','.png','.webp'].includes(ext)||payload.type==='audio'&&!['.ogg','.mp3','.m4a'].includes(ext)||payload.type==='document'&&ext!=='.pdf')fail(400,'media_type_mismatch');await readFile(resolve(directory,'media',payload.media_path));}
     // File validation yields to other requests; recheck before the synchronous transaction.
     const replay=database.prepare('SELECT * FROM operations WHERE idempotency_key=?').get(key);if(replay){if(replay.request_hash!==fingerprint)fail(409,'idempotency_conflict');return send(replay);}
     if(!eligible(database.prepare('SELECT * FROM contacts WHERE id=?').get(c.id)))fail(403,'contact_consent_required');
     const operation=transaction(database,()=>{const jid=c.wa_jid??b.to.slice(1)+'@s.whatsapp.net';let conversation=database.prepare('SELECT id FROM conversations WHERE wa_chat_id=?').get(jid);if(!conversation){conversation={id:randomUUID()};database.prepare('INSERT INTO conversations(id,contact_id,wa_chat_id,display_name) VALUES(?,?,?,?)').run(conversation.id,c.id,jid,c.display_name);}const message=randomUUID(),id=randomUUID(),date=now();database.prepare('INSERT INTO messages(id,conversation_id,direction,type,body,media_path,created_at) VALUES(?,?,?,?,?,?,?)').run(message,conversation.id,'out',payload.type,payload.body,payload.media_path,date);database.prepare('INSERT INTO operations(id,to_e164,type,body,media_path,message_id,idempotency_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,b.to,payload.type,payload.body,payload.media_path,message,key,fingerprint,date,date);return database.prepare('SELECT * FROM operations WHERE id=?').get(id);});audit('message.queued',actor.id,operation.id);return send({...operation,outbound_enabled:false},202);
    }
    if(resource==='media'&&method==='POST'){auth('send');const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','application/pdf':'pdf'};const ext=extensions[b.mime_type];if(!ext||typeof b.base64!=='string'||b.base64.length>14*1024*1024||! /^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))fail(400,'invalid_media');const data=Buffer.from(b.base64,'base64');if(!data.length||data.length>10*1024*1024)fail(413,'invalid_media_size');if(!mediaMatches(data,b.mime_type))fail(415,'media_signature_mismatch');const filename=randomUUID()+'.'+ext;await mkdir(resolve(directory,'media'),{recursive:true,mode:0o700});await writeFile(resolve(directory,'media',filename),data,{flag:'wx',mode:0o600});return send({media_path:filename,mime_type:b.mime_type,size:data.length},201);}
    if(resource==='tokens'){
     auth('read',true);if(method==='GET')return send(database.prepare('SELECT id,name,scopes,created_at,revoked_at FROM tokens').all().map(t=>({...t,scopes:JSON.parse(t.scopes)})));
     if(method==='DELETE'){database.prepare('UPDATE tokens SET revoked_at=? WHERE id=?').run(now(),url.searchParams.get('id'));return send({revoked:true});}
     if(method==='POST'){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.scopes)||!b.scopes.length||b.scopes.some(x=>!scopes.includes(x)))fail(400,'invalid_token');const id=randomUUID(),token='wis_'+randomBytes(32).toString('base64url');database.prepare('INSERT INTO tokens(id,name,token_hash,scopes,created_at) VALUES(?,?,?,?,?)').run(id,b.name,hash(token),JSON.stringify(b.scopes),now());audit('token.created',actor.id,id);return send({id,token},201);}
    }
    if(resource==='webhooks'){
     auth('webhooks:write');if(method==='GET')return send(database.prepare('SELECT id,url,enabled,created_at FROM webhooks').all());if(method==='DELETE'){transaction(database,()=>{database.prepare('DELETE FROM webhook_deliveries WHERE webhook_id=?').run(url.searchParams.get('id'));database.prepare('DELETE FROM webhooks WHERE id=?').run(url.searchParams.get('id'));});return send({deleted:true});}
     if(method==='POST'){let target;try{target=new URL(b.url);}catch{fail(400,'invalid_url');}if(target.protocol!=='https:'||target.username||target.password||target.port&&target.port!=='443')fail(400,'https_required');const id=randomUUID(),secret=randomBytes(32).toString('hex');database.prepare('INSERT INTO webhooks(id,url,secret,created_at) VALUES(?,?,?,?)').run(id,target.href,secret,now());return send({id,url:target.href,enabled:false,secret},201);}
    }
    if(resource==='campaigns'){
     auth('read',true);const parse=c=>({...c,contact_ids:JSON.parse(c.contact_ids),execution_enabled:false});if(method==='GET')return send(database.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all().map(parse));
     if(method==='POST'){if(typeof b.name!=='string'||!b.name.trim()||typeof b.body!=='string'||!b.body.trim()||!Array.isArray(b.contact_ids)||!b.contact_ids.length||b.contact_ids.length>1000||!Number.isInteger(b.daily_limit)||b.daily_limit<1||b.daily_limit>10000||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.window_start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.window_end)||b.window_start>=b.window_end)fail(400,'invalid_campaign');const ids=[...new Set(b.contact_ids)];if(ids.some(id=>!database.prepare('SELECT id FROM contacts WHERE id=?').get(id)))fail(400,'unknown_recipients');const id=randomUUID();database.prepare('INSERT INTO campaigns(id,name,body,contact_ids,daily_limit,window_start,window_end,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,b.name,b.body,JSON.stringify(ids),b.daily_limit,b.window_start,b.window_end,now());return send(parse(database.prepare('SELECT * FROM campaigns WHERE id=?').get(id)),201);}
     if(method==='PATCH'){const campaign=database.prepare('SELECT * FROM campaigns WHERE id=?').get(String(b.id));if(!campaign)fail(404,'not_found');const contacts=JSON.parse(campaign.contact_ids).map(id=>database.prepare('SELECT * FROM contacts WHERE id=?').get(id));const allowed=contacts.filter(eligible);if(b.action==='preview')return send({campaign:parse(campaign),eligible:allowed,excluded:contacts.filter(c=>!eligible(c)),execution_enabled:false});if(!['approve','pause'].includes(b.action))fail(400,'invalid_action');if(b.action==='approve'&&allowed.length!==contacts.length)fail(409,'recipient_consent_required');database.prepare('UPDATE campaigns SET status=?,approved_at=? WHERE id=?').run(b.action==='approve'?'approved':'paused',b.action==='approve'?now():campaign.approved_at,campaign.id);audit('campaign.'+b.action,actor.id,campaign.id);return send({campaign:parse(database.prepare('SELECT * FROM campaigns WHERE id=?').get(campaign.id)),execution_enabled:false});}
    }
    fail(404,'not_found');
   }
   if(path.startsWith('/api/'))fail(404,'not_found');
   if(method!=='GET')fail(405,'method_not_allowed');const relative=path==='/'?'index.html':decodeURIComponent(path.slice(1));if(relative.includes('..')||relative.includes('\\')||relative.startsWith('.'))fail(404,'not_found');const file=resolve(root,'local/public',relative);if(!file.startsWith(resolve(root,'local/public')+'/')&&!file.startsWith(resolve(root,'local/public')+'\\'))fail(404,'not_found');const data=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch(error){if(res.headersSent)return res.end();const status=error.status??(error.code==='ENOENT'?404:error.code?.startsWith('SQLITE_CONSTRAINT')?409:500);res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.status?error.message:status===404?'not_found':status===409?'conflict':'internal_error'}));}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!db.prepare("SELECT value FROM settings WHERE key='admin_password'").get())throw Error('Run npm run setup before starting the server.');const port=Number(process.env.WIS_LOCAL_PORT??3010);makeServer().listen(port,'127.0.0.1',()=>console.log('WIS local ready at http://127.0.0.1:'+port));}
