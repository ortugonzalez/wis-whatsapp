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

// Explicit allowlists: socket/auth objects, QR data and group invite codes never enter snapshots.
export function safeFields(value, keys) {
  const result = {};
  for (const key of keys) {
    const item = value?.[key];
    if (item === null || typeof item === 'boolean') result[key] = item;
    else if (typeof item === 'string') result[key] = item.slice(0, 8192);
    else if (typeof item === 'number' && Number.isFinite(item)) result[key] = item;
    else if (item instanceof Date && !Number.isNaN(item.getTime())) result[key] = item.toISOString();
    else if (item && typeof item.toNumber === 'function') {
      const n = item.toNumber(); if (Number.isSafeInteger(n)) result[key] = n;
    }
  }
  return result;
}
const contactKeys = ['id','lid','phoneNumber','name','notify','verifiedName','username','status'];
export function safeGroup(group) {
  const value = safeFields(group, ['id','subject','owner','ownerPn','ownerUsername','subjectOwner','subjectTime','creation','desc','descOwner','descTime','linkedParent','restrict','announce','memberAddMode','joinApprovalMode','isCommunity','isCommunityAnnounce','size','ephemeralDuration','addressingMode']);
  if (Array.isArray(group?.participants)) value.participants = group.participants.slice(0,4096).map(p=>safeFields(p,[...contactKeys,'admin','isAdmin','isSuperAdmin']));
  return value;
}
function statusSnapshot(rows) {
  return {items:(Array.isArray(rows)?rows:[]).slice(0,20).map(row=>({id:row.id,status:safeFields(row.status,['status','setAt'])}))};
}
export function normalizeContent(m) {
  if(!m)return null;
  const media=['image','audio','document','video','sticker'].find(type=>m[`${type}Message`]);
  if(m.conversation!=null || m.extendedTextMessage) return {type:'text',body:m.conversation || m.extendedTextMessage?.text || '',details:{}};
  if(media) {const value=m[`${media}Message`];return {type:media,body:value.caption || value.fileName || '',details:safeFields(value,['mimetype','fileName','seconds','ptt','width','height','pageCount'])};}
  if(m.locationMessage || m.liveLocationMessage) {const value=m.locationMessage || m.liveLocationMessage;return {type:'location',body:value.name || value.address || 'Ubicación',details:safeFields(value,['degreesLatitude','degreesLongitude','name','address','accuracyInMeters','speedInMps','degreesClockwiseFromMagneticNorth'])};}
  if(m.contactMessage || m.contactsArrayMessage) {const values=m.contactMessage?[m.contactMessage]:m.contactsArrayMessage.contacts || [];return {type:'contact',body:values.map(c=>c.displayName || '').filter(Boolean).join(', ') || 'Contacto',details:{contacts:values.slice(0,100).map(c=>safeFields(c,['displayName','vcard']))}};}
  const poll=m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
  if(poll)return {type:'poll',body:poll.name || 'Encuesta',details:{...safeFields(poll,['name','selectableOptionsCount']),options:(poll.options || []).slice(0,100).map(o=>safeFields(o,['optionName']))}};
  if(m.reactionMessage)return {type:'reaction',body:m.reactionMessage.text || 'Reacción eliminada',details:{...safeFields(m.reactionMessage,['text','senderTimestampMs']),key:safeFields(m.reactionMessage.key,['id','remoteJid','fromMe','participant'])}};
  if(m.buttonsResponseMessage)return {type:'button_reply',body:m.buttonsResponseMessage.selectedDisplayText || '',details:safeFields(m.buttonsResponseMessage,['selectedButtonId','selectedDisplayText','type'])};
  if(m.listResponseMessage)return {type:'list_reply',body:m.listResponseMessage.title || '',details:{...safeFields(m.listResponseMessage,['title','description']),selectedRowId:m.listResponseMessage.singleSelectReply?.selectedRowId || null}};
  if(m.pollUpdateMessage)return {type:'poll_update',body:'Respuesta a encuesta (contenido cifrado no interpretado)',details:{key:safeFields(m.pollUpdateMessage.pollCreationMessageKey,['id','remoteJid','fromMe'])}};
  // Protocol and key-distribution envelopes are not user messages and must not leak.
  const unsupported=Object.keys(m).find(k=>k.endsWith('Message') && !['protocolMessage','senderKeyDistributionMessage','messageContextInfo','fastRatchetKeySenderKeyDistributionMessage'].includes(k));
  return unsupported?{type:'unsupported',body:`Contenido disponible: ${unsupported}`,details:{wire_type:unsupported}}:null;
}

export async function runWorker({ db, baileys, logger, authDir = resolve(root, '.local/baileys-auth'), mediaDir = resolve(root, '.local/media'), readTimeoutMs = 12000 }) {
  mkdirSync(authDir, {recursive:true, mode:0o700});
  mkdirSync(mediaDir, {recursive:true, mode:0o700});
  const owner = randomUUID();
  let sock = null, starting = false, stopping = false, desired = false;
  let deadline = 0, attempts = 0, nextConnect = 0, processing = false;
  let queue = Promise.resolve();
  const cache = new Map();
  const receipts = new Map();
  let readBusy = false, lastReadAt = 0, unresolvedRead = null;
  const connection = () => db.prepare("SELECT * FROM connections WHERE id='wis-5679'").get();
  const owns = () => !stopping && Date.now() < deadline;
  function snapshot(kind, resource, payload) {
    if (!owns() || !resource) return;
    const prior = db.prepare('SELECT payload FROM snapshots WHERE kind=? AND resource_id=?').get(kind,resource);
    let old = {};try { old = JSON.parse(prior?.payload || '{}'); } catch { /* corrupt old snapshot is replaced */ }
    const serialized = JSON.stringify({...old,...payload});
    if (serialized.length>2*1024*1024) throw new Error('snapshot_too_large');
    db.prepare('INSERT INTO snapshots(kind,resource_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(kind,resource,serialized,new Date().toISOString());
  }
  function event(kind, resource, payload) {
    if(!owns())return;
    db.prepare('INSERT INTO events(id,kind,resource_id,payload,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),kind,resource || 'wis-5679',JSON.stringify(payload),new Date().toISOString());
    db.prepare('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 1000)').run();
  }
  function saveContacts(contacts) {
    for(const c of contacts.slice(0,10000)) {
      if(!owns() || !c.id)continue;
      const value=safeFields(c,contactKeys);
      if(c.imgUrl!==undefined)value.avatar_available=Boolean(c.imgUrl && c.imgUrl!=='changed');
      snapshot('contact',c.id,value);
      const rawPhone = c.phoneNumber || (c.id.endsWith('@s.whatsapp.net')?c.id:null);
      const digits=rawPhone?.split('@')[0]?.split(':')[0]?.replace(/^\+/,'');
      const phone=digits && /^[1-9]\d{7,14}$/.test(digits)?'+'+digits:null;
      const merged=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='contact' AND resource_id=?").get(c.id).payload);
      const name=merged.name || merged.verifiedName || merged.notify || merged.username;
      const found=db.prepare('SELECT id FROM contacts WHERE wa_jid=? OR (phone_e164 IS NOT NULL AND phone_e164=?)').get(c.id,phone);
      if(found) {
        if(name)db.prepare('UPDATE contacts SET display_name=? WHERE id=?').run(name,found.id);
        // Do not override a different known phone/LID identity or consent record.
      } else db.prepare('INSERT OR IGNORE INTO contacts(id,phone_e164,wa_jid,display_name,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),phone,c.id,name || phone || c.id,new Date().toISOString());
    }
  }
  function saveChats(chats) {
    for(const c of chats.slice(0,10000)) {
      if(!owns() || !c.id || c.id==='status@broadcast')continue;
      snapshot('chat',c.id,safeFields(c,['id','name','displayName','unreadCount','archived','pinned','muteEndTime','conversationTimestamp','lastMessageRecvTimestamp','readOnly','ephemeralExpiration','markedAsUnread']));
      const name=c.name || c.displayName || null;
      const contact=db.prepare('SELECT id FROM contacts WHERE wa_jid=?').get(c.id);
      db.prepare('INSERT OR IGNORE INTO conversations(id,contact_id,wa_chat_id,title,display_name,last_message_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),contact?.id || null,c.id,name,name,timestamp(c.conversationTimestamp));
      if(name)db.prepare('UPDATE conversations SET title=?,display_name=? WHERE wa_chat_id=?').run(name,name,c.id);
    }
  }
  function saveGroups(groups) {
    for(const group of groups.slice(0,2000)) {
      if(!owns() || !group.id)continue;
      snapshot('group',group.id,safeGroup(group));
      saveChats([{id:group.id,name:group.subject}]);
    }
  }
  async function readCall(current, name, args=[]) {
    if(!owns() || sock!==current || connection().status!=='connected')throw new Error('connection_unavailable');
    if(unresolvedRead?.socket===current)throw new Error('previous_read_unresolved');
    if(typeof current[name]!=='function')throw new Error('capability_unavailable');
    let timer;
    try {
      const pending={socket:current};unresolvedRead=pending;
      // Local timeout does not cancel Baileys' IQ request. Block further reads until
      // that request settles (or a different socket takes over), avoiding fan-out.
      const request=Promise.resolve().then(()=>current[name](...args)).finally(()=>{if(unresolvedRead===pending)unresolvedRead=null;});
      const value=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('read_timeout')),readTimeoutMs);})]);
      if(!owns() || sock!==current)throw new Error('connection_changed');
      return value;
    } finally {clearTimeout(timer);}
  }
  async function readAccount(current) {
    snapshot('profile','wis-5679',safeFields(current.user,contactKeys));
    const jid=current.user?.id?.replace(/:\d+(?=@)/,'');
    if(!jid)throw new Error('account_identity_unavailable');
    const results={};
    for(const [kind,method,args] of [['status','fetchStatus',[jid]],['privacy','fetchPrivacySettings',[]],['business','getBusinessProfile',[jid]]]) {
      try {
        const data=await readCall(current,method,args);
        const payload=kind==='status'?statusSnapshot(data):kind==='privacy'?safeFields(data,['last','online','profile','status','readreceipts','groupadd','calladd','messages','defense']):safeFields(data,['wid','address','description','email','category','business_hours']);
        if(kind==='business' && Array.isArray(data?.website))payload.website=data.website.filter(x=>typeof x==='string').slice(0,20);
        if(kind==='business' && data?.business_hours)payload.business_hours={...safeFields(data.business_hours,['timezone']),config:(data.business_hours.config || data.business_hours.business_config || []).slice(0,28).map(x=>safeFields(x,['day_of_week','mode','open_time','close_time']))};
        snapshot(kind,'wis-5679',{...payload,available:data!=null,error:null});results[kind]='done';
      } catch {
        if(!owns() || sock!==current)throw new Error('connection_changed');
        results[kind]='unavailable';snapshot(kind,'wis-5679',{available:false,error:'read_unavailable'});
      }
    }
    return results;
  }
  async function drainReads() {
    if(readBusy || !owns() || !sock || unresolvedRead?.socket===sock || connection().status!=='connected' || Date.now()-lastReadAt<2000)return;
    const command=db.prepare("SELECT * FROM read_commands WHERE status='pending' ORDER BY created_at LIMIT 1").get();
    if(!command)return;
    readBusy=true;lastReadAt=Date.now();
    const current=sock;
    db.prepare("UPDATE read_commands SET status='running',error=NULL,updated_at=? WHERE id=? AND status='pending'").run(new Date().toISOString(),command.id);
    try {
      if(command.kind==='account' || command.kind==='all')await readAccount(current);
      if(command.kind==='groups' || command.kind==='all') {
        const groups=await readCall(current,'groupFetchAllParticipating');
        saveGroups(Object.values(groups || {}));
      } else if(command.kind==='group') {
        if(!/^\d+(?:-\d+)?@g\.us$/.test(command.target || ''))throw new Error('invalid_target');
        saveGroups([await readCall(current,'groupMetadata',[command.target])]);
      } else if(command.kind==='contact_profile') {
        if(!/^\d+@(s\.whatsapp\.net|lid)$/.test(command.target || ''))throw new Error('invalid_target');
        const statuses=await readCall(current,'fetchStatus',[command.target]);
        const status=statusSnapshot(statuses).items[0]?.status || {};
        snapshot('contact',command.target,{...status,profile_read_at:new Date().toISOString()});
      } else if(!['account','all'].includes(command.kind))throw new Error('unsupported_read_command');
      if(!owns() || sock!==current)throw new Error('connection_changed');
      db.prepare("UPDATE read_commands SET status='done',updated_at=? WHERE id=?").run(new Date().toISOString(),command.id);
      event('read.completed',command.target || 'wis-5679',{kind:command.kind,command_id:command.id});
    } catch {
      if(owns())db.prepare("UPDATE read_commands SET status='failed',error='read_unavailable_or_disconnected',updated_at=? WHERE id=?").run(new Date().toISOString(),command.id);
    } finally {readBusy=false;}
  }
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
        const normalized=normalizeContent(m);
        if(!normalized)continue;
        const {type,body,details}=normalized;
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
        if (source === 'live' && ['image','audio','document','video','sticker'].includes(type)) {
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
        snapshot('message',waId,{type,details,participant:msg.key.participant || null,push_name:msg.pushName || null,source,timestamp:at});
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
      const guarded = handler => payload => {
        if(!owns() || sock!==current)return;
        try {handler(payload);} catch {console.error('metadata_persistence_failed');}
      };
      current.ev.on('messaging-history.set', guarded(({messages,contacts,chats,progress,isLatest,syncType,lidPnMappings}) => {
        if(contacts?.length)saveContacts(contacts);
        if(lidPnMappings?.length)saveContacts(lidPnMappings.slice(0,10000).filter(x=>x.lid && x.pn).map(x=>({id:x.lid,phoneNumber:x.pn,lid:x.lid})));
        if(chats?.length)saveChats(chats);
        snapshot('history','wis-5679',{...safeFields({progress,isLatest,syncType},['progress','isLatest','syncType']),messages_in_chunk:messages?.length || 0,contacts_in_chunk:contacts?.length || 0,chats_in_chunk:chats?.length || 0});
        if(messages?.length)enqueue(messages,'import');
      }));
      current.ev.on('messaging-history.status',guarded(value=>{snapshot('history','wis-5679',safeFields(value,['syncType','status','explicit']));event('history.status','wis-5679',safeFields(value,['syncType','status','explicit']));}));
      current.ev.on('contacts.upsert', guarded(contacts=>saveContacts(contacts)));
      current.ev.on('contacts.update', guarded(contacts=>saveContacts(contacts)));
      current.ev.on('chats.upsert', guarded(chats=>saveChats(chats)));
      current.ev.on('chats.update', guarded(chats=>saveChats(chats)));
      current.ev.on('groups.upsert', guarded(groups=>saveGroups(groups)));
      current.ev.on('groups.update', guarded(groups=>saveGroups(groups)));
      current.ev.on('presence.update', guarded(value=>{
        const presences={};for(const [jid,p] of Object.entries(value.presences || {}).slice(0,256))presences[jid]=safeFields(p,['lastKnownPresence','lastSeen','groupOnlineCount']);
        snapshot('presence',value.id,{presences});
        event('presence.update',value.id,{presences});
      }));
      current.ev.on('group-participants.update',guarded(value=>{
        event('group-participants.update',value.id,{...safeFields(value,['id','author','action']),participants:(value.participants || []).slice(0,4096).map(p=>safeFields(p,[...contactKeys,'admin']))});
      }));
      current.ev.on('labels.edit',guarded(value=>{if(value.id)snapshot('label',String(value.id),safeFields(value,['id','name','color','deleted','predefinedId']));}));
      current.ev.on('labels.association',guarded(value=>{
        const association=safeFields(value.association,['type','chatId','messageId','labelId']);
        event('labels.association',association.chatId || 'wis-5679',{type:value.type,association});
        if(association.chatId && association.labelId)snapshot('label_association',`${association.chatId}:${association.labelId}:${association.messageId || ''}`,{...association,associated:value.type==='add'});
      }));
      current.ev.on('messages.reaction',guarded(values=>{
        for(const value of values.slice(0,1000))event('messages.reaction',value.key?.id || 'unknown',{key:safeFields(value.key,['id','remoteJid','fromMe','participant']),reaction:safeFields(value.reaction,['text','senderTimestampMs'])});
      }));
      current.ev.on('call',guarded(values=>{
        for(const value of values.slice(0,100))event('call',value.id,safeFields(value,['id','from','chatId','date','status','isVideo','isGroup','offline']));
      }));
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
        const safe=safeFields(update,['connection','isOnline','receivedPendingNotifications','isNewLogin']);
        if(Object.keys(safe).length){snapshot('connection','wis-5679',safe);event('connection.update','wis-5679',safe);}
        if(update.qr) patch({status:'qr_pending',qr_payload:update.qr,qr_expires_at:new Date(Date.now()+60000).toISOString(),last_error:null});
        if(update.connection==='open') {
          const phone = current.user?.id?.split(':')[0]?.split('@')[0] || null;
          const expected = connection().expected_phone_e164;
          if(expected && !identityMatches(phone,expected)) {
            desired=false;closeSocket();patch({status:'disconnected',phone,qr_payload:null,qr_expires_at:null,last_error:'identity_mismatch'});return;
          }
          attempts=0;patch({status:'connected',phone,qr_payload:null,qr_expires_at:null,last_error:expected?null:'identity_unverified'});
          snapshot('profile','wis-5679',safeFields(current.user,contactKeys));
          if(!db.prepare("SELECT id FROM read_commands WHERE status IN ('pending','running') AND kind='all'").get()) {
            const now=new Date().toISOString();db.prepare("INSERT INTO read_commands(id,kind,target,status,created_at,updated_at) VALUES(?,'all',NULL,'pending',?,?)").run(randomUUID(),now,now);
          }
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
  db.prepare("UPDATE read_commands SET status='failed',error='worker_interrupted',updated_at=? WHERE status='running'").run(new Date().toISOString());
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
      void drainReads();
    } catch {console.error('worker_tick_failed');}
    finally {ticking=false;}
  }
  const timer=setInterval(()=>void tick(),2000);
  const watchdog=setInterval(()=>{if(!owns())closeSocket();},500);
  const stop=async()=>{stopping=true;clearInterval(timer);clearInterval(watchdog);closeSocket();await queue;db.prepare("UPDATE connections SET lease_owner=NULL,lease_expires_at=NULL,qr_payload=NULL,qr_expires_at=NULL WHERE id='wis-5679' AND lease_owner=?").run(owner);};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  await tick();
  return {stop,drainReads};
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
