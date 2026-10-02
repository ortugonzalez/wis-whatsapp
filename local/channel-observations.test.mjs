import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
process.env.WIS_DB_PATH=':memory:';
const {openDatabase}=await import('./db.mjs');
const {makeServer}=await import('./server.mjs');
test('channel observation filter isolates channels, preserves zero and false, paginates, and rejects invalid filters',async()=>{
 const db=openDatabase(':memory:'),token='wis_'+randomBytes(32).toString('hex');
 db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?,NULL)').run('reader','reader',createHash('sha256').update(token).digest('hex'),'["read"]',new Date().toISOString());
 for(const [channel,server,count] of [['123@newsletter','1',0],['123@newsletter','2',12],['1234@newsletter','1',99]])db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('newsletter_view',channel+':'+server,JSON.stringify({channel_id:channel,server_id:server,reported_view_count:count}),'2026-10-01T00:00:00Z');
 db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run('newsletter_reaction','123@newsletter:2',JSON.stringify({channel_id:'123@newsletter',server_id:'2',reported_event_count:0,removed:false}),'2026-10-01T00:00:00Z');
 const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const query=(params,authorized=true)=>fetch(base+'/api/v1/snapshots?'+new URLSearchParams(params),{headers:authorized?{Authorization:'Bearer '+token}:{}});
 try{
  const params={kind:'newsletter_view',channel_id:'123@newsletter',limit:'1'};
  assert.equal((await query(params,false)).status,401);
  const first=await (await query(params)).json();assert.equal(first.meta.total,2);assert.equal(first.meta.has_more,true);assert.equal(first.meta.complete,false);assert.equal(first.data[0].data.reported_view_count,0);
  const second=await (await query({...params,offset:'1'})).json();assert.equal(second.meta.has_more,false);assert.equal(second.data[0].data.reported_view_count,12);
  const reaction=await (await query({...params,kind:'newsletter_reaction'})).json();assert.equal(reaction.data[0].data.removed,false);assert.equal(reaction.data[0].data.reported_event_count,0);
  assert.equal((await (await query({...params,resource_id:'1234@newsletter:1'})).json()).data.length,0);
  for(const patch of [{channel_id:'123%'},{channel_id:''},{kind:'contact'},{kind:'account_setting'}])assert.equal((await query({...params,...patch})).status,400);
  assert.equal(db.prepare('SELECT count(*) n FROM read_commands').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
test('channel observation rendering distinguishes unknown from zero and does not inject received text',()=>{
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const sandbox={resourceDetail:async()=>{},kv:(title,value)=>title+': '+escape(value),fmt:value=>value};
 runInNewContext(readFileSync(new URL('./public/channel-observations.js',import.meta.url),'utf8'),sandbox);
 const html=sandbox.channelObservationRows([{data:{server_id:'<img src=x>',reported_event_count:0,removed:false,code:'<script>'}}],'newsletter_reaction');
 assert.match(html,/notificación: 0/);assert.match(html,/Retirada informada: No/);assert.doesNotMatch(html,/<img|<script/);
 const unknown=sandbox.channelObservationRows([{data:{server_id:'1',removed:null}}],'newsletter_reaction');assert.match(unknown,/Retirada informada: No informada/);
 assert.match(sandbox.channelObservationRows([{data:{reported_view_count:0}}],'newsletter_view'),/Vistas informadas: 0/);
});
test('a late channel A drawer cannot attach observations to channel B',async()=>{
 let current,resolveA;const appended=[];
 const drawer=id=>({id,isConnected:true,querySelector:selector=>selector==='.drawer-body'?{append:el=>appended.push({id,el})}:null});
 const sandbox={viewEpoch:1,document:{querySelector:()=>current},resourceDetail:async(resource,row)=>{current=drawer(row);if(row==='1@newsletter')await new Promise(r=>{resolveA=r;});}};
 runInNewContext(readFileSync(new URL('./public/channel-observations.js',import.meta.url),'utf8'),sandbox);
 sandbox.channelObservationsCard=id=>({el:id,start(){}});
 const a=sandbox.resourceDetail('channels','1@newsletter');await sandbox.resourceDetail('channels','2@newsletter');resolveA();await a;
 assert.deepEqual(appended,[{id:'2@newsletter',el:'2@newsletter'}]);
});
