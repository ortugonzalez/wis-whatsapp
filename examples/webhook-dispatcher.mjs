// Run explicitly after approval: node --env-file=.env.local examples/webhook-dispatcher.mjs
// Configure WIS_WEBHOOKS_ENABLED=true and WIS_WEBHOOK_ALLOWED_HOSTS=hooks.example.com.
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { pathToFileURL } from 'node:url';

export function sign(secret, timestamp, payload) { return createHmac('sha256', secret).update(timestamp + '.' + payload).digest('hex'); }
export function isPublicIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0)) || (a===100 && b>=64 && b<=127) || (a===198 && (b===18 || b===19)));
}
async function deliver(webhook, row) {
  const url = new URL(webhook.url);
  const allowed = (process.env.WIS_WEBHOOK_ALLOWED_HOSTS || '').split(',').map(s=>s.trim());
  if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(url.hostname) || (url.port && url.port !== '443')) throw Error('destination_not_allowed');
  const addresses = await lookup(url.hostname,{all:true,family:4});
  if (!addresses.length || addresses.some(a=>!isPublicIPv4(a.address))) throw Error('destination_not_public');
  const payload=JSON.stringify(row.payload);const timestamp=String(Math.floor(Date.now()/1000));
  await new Promise((resolve,reject)=>{
    const req=request(url,{method:'POST',lookup:(_host,_options,cb)=>cb(null,addresses[0].address,4),headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-WIS-Event-ID':row.event_id,'X-WIS-Timestamp':timestamp,'X-WIS-Signature':'sha256='+sign(webhook.secret,timestamp,payload)}},res=>{res.resume();res.on('end',()=>res.statusCode>=200&&res.statusCode<300?resolve():reject(Error('receiver_http_'+res.statusCode)));});
    const deadline=setTimeout(()=>req.destroy(Error('receiver_deadline')),15000);
    req.once('close',()=>clearTimeout(deadline));
    req.setTimeout(10000,()=>req.destroy(Error('receiver_timeout')));req.on('error',reject);req.end(payload);
  });
}
export async function dispatch() {
  if(process.env.WIS_WEBHOOKS_ENABLED!=='true')throw Error('Webhook delivery disabled; requires approved configuration.');
  const {db,transaction}=await import('../local/db.mjs');
  const rows=transaction(db,()=>{
    const current=new Date().toISOString();
    db.prepare("UPDATE webhook_deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,last_error='interrupted_delivery' WHERE status='sending' AND available_at<=?").run(current);
    const pending=db.prepare("SELECT d.* FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.status='pending' AND d.attempts<5 AND d.available_at<=? AND w.enabled=1 LIMIT 20").all(current);
    for(const row of pending)db.prepare("UPDATE webhook_deliveries SET status='sending',attempts=attempts+1,available_at=? WHERE id=?").run(new Date(Date.now()+600000).toISOString(),row.id);
    return pending.map(row=>({...row,payload:JSON.parse(row.payload),attempts:row.attempts+1}));
  });
  for(const row of rows||[]){
    const webhook=db.prepare('SELECT * FROM webhooks WHERE id=?').get(row.webhook_id);
    let values;
    try{if(!webhook?.enabled)throw Error('webhook_disabled');await deliver(webhook,row);values={status:'delivered',last_error:null,available_at:row.available_at};}
    catch{values={status:row.attempts>=5?'failed':'pending',last_error:'delivery_failed',available_at:new Date(Date.now()+Math.min(3600000,1000*2**row.attempts)).toISOString()};}
    db.prepare('UPDATE webhook_deliveries SET status=?,last_error=?,available_at=? WHERE id=?').run(values.status,values.last_error,values.available_at,row.id);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)dispatch().catch(()=>{console.error('Dispatcher stopped; inspect configuration and delivery records.');process.exitCode=1;});
