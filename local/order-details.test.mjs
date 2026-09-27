import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {runWorker,safeOrderDetails,validOrderDetails} from './worker.mjs';

test('order item lookup uses an in-memory token and persists only bounded fields without URLs',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));const now='2026-01-01T00:00:00.000Z',jid='12025550111@s.whatsapp.net';
 db.prepare('INSERT INTO connections(id,command,updated_at) VALUES(?,?,?)').run('wis-5679','connect',now);db.prepare('INSERT INTO conversations(id,wa_chat_id,last_message_preview,last_message_at) VALUES(?,?,?,?)').run('chat',jid,'Pedido recibido',now);
 let calls=0;const ev=new EventEmitter(),token='dG9rZW4tZXBoZW1lcmFs',socket={ev,user:{id:'5491111115679@s.whatsapp.net'},end(){},getOrderDetails:async(id,provided)=>{calls++;assert.equal(id,'order-1');assert.equal(provided,token);return {price:{total:99.5,currency:'ARS'},products:[{id:'sku-1',name:'Item <x>',quantity:2,price:49.75,currency:'ARS',imageUrl:'https://secret.example/image?token=x'}]};}};
 const fake={default:()=>socket,useMultiFileAuthState:async()=>({state:{creds:{},keys:{}},saveCreds:async()=>{}}),makeCacheableSignalKeyStore:()=>({}),downloadMediaMessage:async()=>{throw Error('unexpected_download');},DisconnectReason:{loggedOut:401}};
 const worker=await runWorker({db,baileys:fake,logger:{},readIntervalMs:0,authDir:resolve(mkdtempSync(resolve(tmpdir(),'wis-order-')),'auth')});
 try{ev.emit('connection.update',{connection:'open'});ev.emit('messages.upsert',{type:'notify',messages:[{key:{id:'wa-order',remoteJid:jid,fromMe:false},messageTimestamp:1767225600,message:{orderMessage:{orderId:'order-1',token,orderTitle:'Pedido',itemCount:1,totalAmount1000:99500}}},{key:{id:'wa-no-token',remoteJid:jid,fromMe:false},messageTimestamp:1767225601,message:{orderMessage:{orderId:'order-2',orderTitle:'Pedido sin token'}}}]});await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(db.prepare("SELECT type FROM messages WHERE wa_message_id='wa-order'").get().type,'order');db.prepare('INSERT INTO read_commands(id,kind,target,created_at,updated_at) VALUES(?,?,?,?,?)').run('read-order','order_details','wa-order',now,now);await worker.drainReads();
  assert.equal(calls,1);assert.equal(db.prepare("SELECT status FROM read_commands WHERE id='read-order'").get().status,'done');const payload=JSON.parse(db.prepare("SELECT payload FROM snapshots WHERE kind='order_details' AND resource_id='wa-order'").get().payload);assert.equal(payload.products[0].name,'Item <x>');assert.equal(payload.products[0].image_available,true);assert.equal(JSON.stringify(payload).includes('secret.example'),false);assert.equal(JSON.stringify(payload).includes(token),false);assert.equal(JSON.stringify(payload).includes('imageUrl'),false);
  db.prepare('INSERT INTO read_commands(id,kind,target,created_at,updated_at) VALUES(?,?,?,?,?)').run('read-no-token','order_details','wa-no-token',now,now);await worker.drainReads();assert.equal(db.prepare("SELECT status||':'||error AS outcome FROM read_commands WHERE id='read-no-token'").get().outcome,'failed:order_credential_unavailable');assert.equal(db.prepare("SELECT 1 FROM snapshots WHERE kind='order_details' AND resource_id='wa-no-token'").get(),undefined);assert.equal(calls,1);
  const rows=db.prepare('SELECT id,direction,type,body,media_path,delivery_status,created_at FROM messages ORDER BY created_at').all();assert.equal(rows.length,2);assert.deepEqual({...rows[0]},{id:rows[0].id,direction:'in',type:'order',body:'Pedido',media_path:null,delivery_status:'delivered',created_at:new Date(1767225600*1000).toISOString()});assert.equal(rows[1].body,'Pedido sin token');
 }finally{await worker.stop();db.close();}
});

test('order details sanitizer omits malformed, unbounded and URL fields',()=>{
 const data=safeOrderDetails({price:{total:Infinity,currency:'ARS'.repeat(20)},products:Array.from({length:101},(_,i)=>({id:String(i),name:'x'.repeat(600),quantity:1,price:2,imageUrl:'https://example.test/secret'}))},'2026-01-01T00:00:00.000Z');assert.equal(data.truncated,true);assert.equal(data.items_received,100);assert.equal(data.products.length,100);assert.equal(data.products[0].name.length,500);assert.equal(data.price.total,undefined);assert.equal(data.products[0].image_available,true);assert.equal(JSON.stringify(data).includes('example.test'),false);
});

test('empty Baileys parser defaults cannot be treated as a verified order response',()=>{
 assert.equal(validOrderDetails({price:{total:0,currency:''},products:[]}),false);
 assert.equal(validOrderDetails({price:{total:10,currency:'ARS'},products:[null]}),false);
 assert.equal(validOrderDetails({price:{total:10,currency:'ARS'},products:[{id:'sku',name:'Item',price:10,quantity:1,currency:'ARS'}]}),true);
});
