import {createHmac} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';

export const sign=(secret,timestamp,payload)=>createHmac('sha256',secret).update(timestamp+'.'+payload).digest('hex');
export function isPublicIPv4(ip) {
 if(isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===88&&c===99)))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function deliverWebhook(hook,row,{resolveDns=lookup,requestImpl=request,allowedHosts=[],now=Date.now,signal,authorized=()=>true}={}) {
 let url;try{url=new URL(hook.url);}catch{throw Error('destination_not_allowed');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!allowedHosts.includes(url.hostname))throw Error('destination_not_allowed');
 let dnsTimer,addresses;
 try {addresses=await Promise.race([resolveDns(url.hostname,{all:true,family:4}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('dns_timeout')),5000);})]);}finally{clearTimeout(dnsTimer);}
 if(!addresses.length||addresses.some(x=>!isPublicIPv4(x.address)))throw Error('destination_not_public');
 if(signal?.aborted||!authorized())throw Error('dispatcher_stopped');
 let data;try{data=JSON.parse(row.payload);}catch{throw Error('invalid_payload');}
 if(data?.id!==row.event_id||Buffer.byteLength(row.payload)>1024*1024)throw Error('invalid_payload');
 const payload=row.payload,timestamp=String(Math.floor(now()/1000));
 return new Promise((resolve,reject)=>{
  const req=requestImpl(url,{method:'POST',signal,lookup:(_host,options,cb)=>options?.all?cb(null,[{address:addresses[0].address,family:4}]):cb(null,addresses[0].address,4),headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-WIS-Event-ID':row.event_id,'X-WIS-Timestamp':timestamp,'X-WIS-Signature':'sha256='+sign(hook.secret,timestamp,payload)}},res=>{
   res.resume();const code=res.statusCode;
   if(code>=200&&code<300)resolve();else reject(Error(code>=300&&code<400?'redirect_rejected':code===429?'receiver_rate_limited':'receiver_http_error'));
  });
  const timer=setTimeout(()=>req.destroy(Error('receiver_timeout')),15000);
  req.once('close',()=>clearTimeout(timer));req.once('error',reject);req.end(payload);
 });
}
const safeErrors=new Set(['destination_not_allowed','destination_not_public','dns_timeout','invalid_payload','dispatcher_stopped','redirect_rejected','receiver_rate_limited','receiver_http_error','receiver_timeout']);
export function createWebhookDispatcher({db,enabled=()=>process.env.WIS_WEBHOOKS_ENABLED==='true',owns=()=>true,allowedHosts=()=>String(process.env.WIS_WEBHOOK_ALLOWED_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean),deliver=deliverWebhook,now=Date.now}={}) {
 let busy,stopped=false;const controller=new AbortController();
 async function run() {
  if(stopped||!enabled()||!owns())return;
  const date=new Date(now()).toISOString(),lease=new Date(now()+60000).toISOString();let row;
  db.exec('BEGIN IMMEDIATE');
  try {
   db.prepare("UPDATE webhook_deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,last_error='interrupted_delivery' WHERE status='sending' AND available_at<=?").run(date);
   row=db.prepare("SELECT d.* FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.status='pending' AND d.attempts<5 AND d.available_at<=? AND w.enabled=1 ORDER BY d.available_at,d.id LIMIT 1").get(date);
   if(row)db.prepare("UPDATE webhook_deliveries SET status='sending',attempts=attempts+1,available_at=? WHERE id=? AND status='pending'").run(lease,row.id);
   db.exec('COMMIT');
  } catch(error){db.exec('ROLLBACK');throw error;}
  if(!row)return;
  let status='delivered',error=null;
  try {
   const hook=db.prepare('SELECT * FROM webhooks WHERE id=?').get(row.webhook_id);
   if(stopped||!enabled()||!owns()||!hook?.enabled)throw Error('dispatcher_stopped');
   const authorized=()=>!stopped&&enabled()&&owns()&&Boolean(db.prepare("SELECT 1 FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.id=? AND d.status='sending' AND d.available_at=? AND w.enabled=1").get(row.id,lease));
   await deliver(hook,row,{allowedHosts:allowedHosts(),now,signal:controller.signal,authorized});
  } catch(failure){error=safeErrors.has(failure?.message)?failure.message:'delivery_failed';status=row.attempts+1>=5?'failed':'pending';}
  const available=new Date(now()+Math.min(3600000,1000*2**(row.attempts+1))).toISOString();
  db.prepare("UPDATE webhook_deliveries SET status=?,last_error=?,available_at=? WHERE id=? AND status='sending' AND available_at=?").run(status,error,available,row.id,lease);
 }
 return {tick(){if(!busy)busy=run().finally(()=>{busy=null;});return busy;},async stop(){stopped=true;controller.abort();await busy;}};
}
