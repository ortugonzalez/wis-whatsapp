import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireWorker = createRequire(resolve(root, 'package.json'));
export function timestamp(value) {
  try {
    const n = Number(value && typeof value.toNumber === 'function' ? value.toNumber() : value);
    return Number.isFinite(n) && n > 0 && n < Date.now() / 1000 + 300 ? new Date(Math.floor(n) * 1000).toISOString() : null;
  } catch { return null; }
}
export function identityMatches(phone, expected) {
  return Boolean(/^\+[1-9]\d{7,14}$/.test(expected || '') && String(phone || '').replace(/\D/g, '') === expected.slice(1));
}
export function acquireLease(db, owner, now = Date.now()) {
  return db.prepare(`UPDATE connections SET lease_owner=?,lease_expires_at=? WHERE id='wis-5679' AND (lease_owner=? OR lease_expires_at IS NULL OR lease_expires_at<=?)`)
    .run(owner, new Date(now + 30000).toISOString(), owner, new Date(now).toISOString()).changes === 1;
}
export function mediaFile(base, path) {
  const full = resolve(base, path);
  const rel = relative(base, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('invalid_media_path');
  return full;
}

export async function runWorker({ db, baileys, logger, authDir = resolve(root, '.local/baileys-auth'), mediaDir = resolve(root, '.local/media') }) {
  mkdirSync(authDir, {recursive:true, mode:0o700});
  mkdirSync(mediaDir, {recursive:true, mode:0o700});
  const owner = randomUUID();
  let sock = null, starting = false, stopping = false, desired = false;
  let deadline = 0, attempts = 0, nextConnect = 0, processing = false;
  let queue = Promise.resolve();
  const cache = new Map();
  const receipts = new Map();
  const connection = () => db.prepare("SELECT * FROM connections WHERE id='wis-5679'").get();
  const owns = () => !stopping && Date.now() < deadline;
  const patch = (values) => {
    if (!owns()) return;
    db.prepare(`UPDATE connections SET ${Object.keys(values).map(k => `${k}=?`).join(',')},updated_at=? WHERE id='wis-5679' AND lease_owner=?`).run(...Object.values(values), new Date().toISOString(), owner);
  };
  function closeSocket() {
    const old = sock; sock = null;
    if (old) old.end(new Error('local_worker_stopped'));
  }
  async function persist(messages, source) {
    for (const msg of messages) {
      if (!owns()) return;
      try {
        const jid = msg.key?.remoteJid, waId = msg.key?.id;
        if (!jid || !waId || jid === 'status@broadcast') continue;
        if (db.prepare('SELECT id FROM messages WHERE wa_message_id=?').get(waId)) continue;
        const at = timestamp(msg.messageTimestamp) || (source === 'live' ? new Date().toISOString() : null);
        if (!at) continue;
        const raw = msg.message;
        const m = raw?.ephemeralMessage?.message || raw?.documentWithCaptionMessage?.message || raw;
        if (!m) continue;
        const type = m.conversation || m.extendedTextMessage ? 'text' : m.imageMessage ? 'image' : m.audioMessage ? 'audio' : m.documentMessage ? 'document' : m.videoMessage ? 'video' : m.stickerMessage ? 'sticker' : null;
        if (!type) continue;
        const content = m[`${type}Message`];
        const body = m.conversation || m.extendedTextMessage?.text || content?.caption || content?.fileName || '';
        const phone = jid.endsWith('@s.whatsapp.net') ? '+' + jid.split('@')[0].split(':')[0] : null;
        let contact = null;
        if (!jid.endsWith('@g.us')) {
          contact = db.prepare('SELECT * FROM contacts WHERE wa_jid=? OR (phone_e164 IS NOT NULL AND phone_e164=?)').get(jid, phone);
          if (!contact) {
            contact = {id:randomUUID()};
            db.prepare('INSERT INTO contacts(id,phone_e164,wa_jid,display_name,created_at) VALUES(?,?,?,?,?)').run(contact.id, phone, jid, msg.key.fromMe ? phone || jid : msg.pushName || phone || jid, at);
          }
        }
        let chat = db.prepare('SELECT * FROM conversations WHERE wa_chat_id=?').get(jid);
        if (!chat) {
          chat = {id:randomUUID()};
          db.prepare('INSERT INTO conversations(id,contact_id,wa_chat_id,last_message_preview,last_message_at) VALUES(?,?,?,?,?)').run(chat.id,contact?.id || null,jid,body || `[${type}]`,at);
        }
        let media = null;
        // History persistence never triggers a media reupload request or other WA write.
        if (source === 'live' && type !== 'text') {
          try {
            const data = await baileys.downloadMediaMessage(msg,'buffer',{}, {logger});
            if (owns() && Buffer.isBuffer(data) && data.length <= 25*1024*1024) {
              media = randomUUID() + '.' + ({image:'jpg',audio:'ogg',document:'bin',video:'mp4',sticker:'webp'}[type]);
              writeFileSync(mediaFile(mediaDir, media),data,{mode:0o600});
            }
          } catch { /* Keep readable message when media has expired. */ }
        }
        if (!owns()) return;
        db.prepare(`INSERT OR IGNORE INTO messages(id,conversation_id,wa_message_id,direction,type,body,media_path,delivery_status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(randomUUID(),chat.id,waId,msg.key.fromMe?'out':'in',type,body,media,msg.key.fromMe?'sent':'delivered',source,at);
        db.prepare('UPDATE conversations SET last_message_preview=?,last_message_at=? WHERE id=? AND (last_message_at IS NULL OR last_message_at<=?)').run(body || `[${type}]`,at,chat.id,at);
        if (msg.message) { cache.set(waId,msg.message); if(cache.size>1000) cache.delete(cache.keys().next().value); }
      } catch { console.error('message_persistence_failed'); }
    }
  }
  const enqueue = (messages, source) => { queue = queue.then(() => persist(messages,source)).catch(() => console.error('history_queue_failed')); };

  async function connect() {
    if (sock || starting || !owns() || !desired || Date.now()<nextConnect) return;
    starting = true;
    try {
      const {state,saveCreds} = await baileys.useMultiFileAuthState(authDir);
      if (!owns() || !desired) return;
      const current = baileys.default({auth:{creds:state.creds,keys:baileys.makeCacheableSignalKeyStore(state.keys,logger)},logger,markOnlineOnConnect:false,getMessage:async key=>cache.get(key.id)});
      sock=current;
      current.ev.on('creds.update', () => { if(owns() && sock===current) void saveCreds().catch(()=>console.error('session_save_failed')); });
      current.ev.on('messages.upsert', ({messages}) => {if(owns() && sock===current) enqueue(messages,'live');});
      current.ev.on('messaging-history.set', ({messages}) => {if(owns() && sock===current && messages?.length) enqueue(messages,'import');});
      current.ev.on('contacts.upsert', contacts => {
        if(!owns() || sock!==current) return;
        for(const c of contacts) if(c.id && (c.name || c.verifiedName || c.notify)) db.prepare('UPDATE contacts SET display_name=? WHERE wa_jid=?').run(c.name || c.verifiedName || c.notify,c.id);
      });
      current.ev.on('messages.update', updates => {
        if(!owns() || sock!==current) return;
        for(const {key,update} of updates) {
          const status = {2:'sent',3:'delivered',4:'read',5:'read'}[update.status];
          if(status) {
            const previous=receipts.get(key.id);
            const rank={sent:1,delivered:2,read:3};
            if(!previous || rank[status]>rank[previous])receipts.set(key.id,status);
            if(receipts.size>5000)receipts.delete(receipts.keys().next().value);
            db.prepare("UPDATE messages SET delivery_status=? WHERE wa_message_id=? AND delivery_status!='read' AND NOT(delivery_status='delivered' AND ?='sent')").run(status,key.id,status);
            db.prepare("UPDATE operations SET status=?,updated_at=? WHERE wa_message_id=? AND status IN ('sent','delivered') AND NOT(status='delivered' AND ?='sent')").run(status,new Date().toISOString(),key.id,status);
          }
        }
      });
      current.ev.on('connection.update', update => {
        if(!owns() || sock!==current) return;
        if(update.qr) patch({status:'qr_pending',qr_payload:update.qr,qr_expires_at:new Date(Date.now()+60000).toISOString(),last_error:null});
        if(update.connection==='open') {
          const phone = current.user?.id?.split(':')[0]?.split('@')[0] || null;
          const expected = connection().expected_phone_e164;
          if(expected && !identityMatches(phone,expected)) {
            desired=false;closeSocket();patch({status:'disconnected',phone,qr_payload:null,qr_expires_at:null,last_error:'identity_mismatch'});return;
          }
          attempts=0;patch({status:'connected',phone,qr_payload:null,qr_expires_at:null,last_error:expected?null:'identity_unverified'});
        }
        if(update.connection==='close') {
          sock=null;
          const code=update.lastDisconnect?.error?.output?.statusCode;
          if(code===baileys.DisconnectReason.loggedOut) {desired=false;patch({status:'disconnected',qr_payload:null,qr_expires_at:null,last_error:'session_revoked'});return;}
          attempts++;
          if(attempts>5) desired=false;
          nextConnect=Date.now()+Math.min(60000,2000*2**(attempts-1));
          patch({status:desired?'qr_pending':'disconnected',qr_payload:null,qr_expires_at:null,last_error:desired?'reconnecting':'reconnect_exhausted'});
        }
      });
    } catch {attempts++;nextConnect=Date.now()+10000;if(attempts>5) desired=false;patch({last_error:'connection_start_failed'});}
    finally {starting=false;}
  }

  function canSend(row) {
    const c=connection();
    if(process.env.WIS_OUTBOUND_ENABLED!=='true' || !owns() || !sock || c.status!=='connected' || !identityMatches(c.phone,c.expected_phone_e164)) throw new Error('outbound_disabled_or_identity_unverified');
    const contact=db.prepare('SELECT * FROM contacts WHERE phone_e164=?').get(row.to_e164);
    if(!contact || contact.opted_out_at || !contact.consent_at || !contact.consent_source || !contact.consent_scope) throw new Error('verified_consent_required');
  }
  async function drain() {
    if(processing || process.env.WIS_OUTBOUND_ENABLED!=='true' || !owns() || !sock) return;
    processing=true;
    let row,attempted=false;
    try {
      row=db.prepare("SELECT * FROM operations WHERE status='pending' ORDER BY created_at LIMIT 1").get();
      if(!row)return;
      canSend(row);
      let content;
      if(row.type==='text') content={text:row.body};
      else if(['image','audio','document','video'].includes(row.type) && row.media_path) {
        const data=readFileSync(mediaFile(mediaDir,row.media_path));
        const mime = row.media_path.endsWith('.mp3')?'audio/mpeg':row.media_path.endsWith('.m4a')?'audio/mp4':'audio/ogg';
        content={[row.type]:data,...(row.type==='audio'?{mimetype:mime}:{caption:row.body || undefined}),...(row.type==='document'?{fileName:row.media_path,mimetype:row.media_path.endsWith('.pdf')?'application/pdf':'application/octet-stream'}:{})};
      } else throw new Error('unsupported_message');
      if(!db.prepare("UPDATE operations SET status='sending',updated_at=? WHERE id=? AND status='pending'").run(new Date().toISOString(),row.id).changes)return;
      canSend(row);
      attempted=true;
      const sent=await sock.sendMessage(row.to_e164.slice(1)+'@s.whatsapp.net',content);
      if(!sent?.key?.id)throw new Error('missing_result');
      if(sent.message)cache.set(sent.key.id,sent.message);
      db.exec('BEGIN IMMEDIATE');
      try {
        const echo=db.prepare('SELECT id,delivery_status FROM messages WHERE wa_message_id=?').get(sent.key.id);
        const rank={sent:1,delivered:2,read:3};
        const status=[echo?.delivery_status,receipts.get(sent.key.id),'sent'].filter(Boolean).sort((a,b)=>(rank[b]||0)-(rank[a]||0))[0];
        if(row.message_id && echo && echo.id!==row.message_id)db.prepare('DELETE FROM messages WHERE id=?').run(echo.id);
        if(row.message_id)db.prepare('UPDATE messages SET wa_message_id=?,delivery_status=? WHERE id=?').run(sent.key.id,status,row.message_id);
        db.prepare('UPDATE operations SET status=?,wa_message_id=?,last_error=NULL,updated_at=? WHERE id=?').run(status,sent.key.id,new Date().toISOString(),row.id);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK');throw error; }
    } catch {
      if(row)db.prepare('UPDATE operations SET status=?,last_error=?,updated_at=? WHERE id=?').run(attempted?'outcome_unknown':'failed',attempted?'reconciliation_required':'outbound_policy_or_validation_failed',new Date().toISOString(),row.id);
    } finally {processing=false;}
  }

  if(!acquireLease(db,owner)) throw new Error('another_worker_owns_connection');
  deadline=Date.now()+25000;
  desired=['connected','qr_pending'].includes(connection().status);
  db.prepare("UPDATE operations SET status='outcome_unknown',last_error='interrupted_send_requires_reconciliation' WHERE status='sending'").run();
  let ticking=false;
  async function tick() {
    if(stopping || ticking)return;
    ticking=true;
    try {
      if(!acquireLease(db,owner)) {deadline=0;closeSocket();return;}
      deadline=Date.now()+25000;
      const c=connection();
      if(c.qr_expires_at && c.qr_expires_at<=new Date().toISOString())patch({qr_payload:null,qr_expires_at:null});
      if(c.command) {
        patch({command:null});
        if(c.command==='logout') {
          desired=false; const old=sock;sock=null;
          if(old) await old.logout().catch(()=>{});
          for(const f of readdirSync(authDir,{withFileTypes:true})) if(f.isFile() && f.name.endsWith('.json'))unlinkSync(resolve(authDir,f.name));
          patch({status:'disconnected',phone:null,qr_payload:null,qr_expires_at:null,last_error:null});
        }
        else if(c.command==='disconnect') {desired=false;closeSocket();patch({status:'disconnected',qr_payload:null,qr_expires_at:null,last_error:null});}
        else if(c.command==='connect' || c.command==='reconnect') {desired=true;attempts=0;nextConnect=0;closeSocket();patch({status:'qr_pending',qr_payload:null,qr_expires_at:null,last_error:null});}
      }
      await connect();
      void drain();
    } catch {console.error('worker_tick_failed');}
    finally {ticking=false;}
  }
  const timer=setInterval(()=>void tick(),2000);
  const watchdog=setInterval(()=>{if(!owns())closeSocket();},500);
  const stop=async()=>{stopping=true;clearInterval(timer);clearInterval(watchdog);closeSocket();await queue;db.prepare("UPDATE connections SET lease_owner=NULL,lease_expires_at=NULL,qr_payload=NULL,qr_expires_at=NULL WHERE id='wis-5679' AND lease_owner=?").run(owner);};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  await tick();
  return {stop};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  // Values are read locally and are never printed, including the QR and auth state.
  const env=resolve(root,'.env.local');
  if(existsSync(env)) for(const line of readFileSync(env,'utf8').split(/\r?\n/)) {
    const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m && process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
  const {openDatabase}=await import('./db.mjs');
  const baileys=await import(pathToFileURL(requireWorker.resolve('baileys')).href);
  const pino=requireWorker('pino');
  runWorker({db:openDatabase(),baileys,logger:pino({level:'silent'})}).catch(()=>{console.error('worker_start_failed');process.exitCode=1;});
}
