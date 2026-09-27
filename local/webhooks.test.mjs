import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createWebhookDispatcher,deliverWebhook,isPublicIPv4,sign} from './webhooks.mjs';
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));return db;}
test('dispatcher gates, leases, retries stable event bytes, and sanitizes errors',async()=>{
 const db=database();let clock=1700000000000,active=false,calls=0;
 const payload=JSON.stringify({id:'event',type:'test',data:{}});
 db.prepare('INSERT INTO webhooks VALUES(?,?,?,?,?)').run('hook','https://example.com','fake',1,new Date(clock).toISOString());
 db.prepare('INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload,available_at,created_at) VALUES(?,?,?,?,?,?,?)').run('delivery','hook','event','test',payload,new Date(clock).toISOString(),new Date(clock).toISOString());
 const dispatcher=createWebhookDispatcher({db,enabled:()=>active,now:()=>clock,deliver:async(_hook,row)=>{calls++;assert.equal(row.payload,payload);assert.equal(row.event_id,'event');throw Error('SECRET');}});
 await dispatcher.tick();assert.equal(calls,0);active=true;
 for(let i=0;i<5;i++){await Promise.all([dispatcher.tick(),dispatcher.tick()]);clock+=60000;}
 assert.equal(calls,5);const row=db.prepare('SELECT * FROM webhook_deliveries').get();assert.equal(row.status,'failed');assert.equal(row.last_error,'delivery_failed');assert.equal(row.attempts,5);
 await dispatcher.stop();db.close();
});
test('HTTPS destination is pinned, no redirects, payload signature binds exact bytes',async()=>{
 const hook={url:'https://example.com/path',secret:'fake'};const row={event_id:'event',payload:'{"id":"event","type":"test","data":{}}'};
 for(const ip of ['127.0.0.1','10.0.0.2','169.254.169.254','::1','198.51.100.1'])assert.equal(isPublicIPv4(ip),false);
 await assert.rejects(deliverWebhook(hook,row,{allowedHosts:['example.com'],resolveDns:async()=>[{address:'127.0.0.1'}]}),/destination_not_public/);
 let requests=0;
 await assert.rejects(deliverWebhook(hook,row,{allowedHosts:['example.com'],resolveDns:async()=>[{address:'8.8.8.8'}],now:()=>1700000000000,requestImpl:(_url,options,callback)=>{
  requests++;assert.equal(options.headers['X-WIS-Signature'],'sha256='+sign('fake','1700000000',row.payload));
  options.lookup('example.com',{},(_err,ip)=>assert.equal(ip,'8.8.8.8'));
  const req=new EventEmitter();req.end=body=>{assert.equal(body,row.payload);callback({statusCode:302,resume(){}});req.emit('close');};req.destroy=()=>{};return req;
 }}),/redirect_rejected/);assert.equal(requests,1);
});
test('active lease prevents second dispatcher; abandoned final lease fails without replay',async()=>{
 const db=database();const now=1700000000000,date=new Date(now).toISOString();let finish,calls=0;
 db.prepare('INSERT INTO webhooks VALUES(?,?,?,?,?)').run('hook','https://example.com','fake',1,date);
 db.prepare('INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload,available_at,created_at) VALUES(?,?,?,?,?,?,?)').run('delivery','hook','event','test','{"id":"event"}',date,date);
 const options={db,enabled:()=>true,now:()=>now,deliver:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}};
 const a=createWebhookDispatcher(options),b=createWebhookDispatcher(options);
 const pending=a.tick();await b.tick();assert.equal(calls,1);finish();await pending;
 assert.equal(db.prepare('SELECT status FROM webhook_deliveries').get().status,'delivered');
 db.prepare("UPDATE webhook_deliveries SET status='sending',attempts=5,available_at=?").run(date);
 await b.tick();assert.equal(calls,1);assert.equal(db.prepare('SELECT status FROM webhook_deliveries').get().status,'failed');
 await a.stop();await b.stop();db.close();
});
