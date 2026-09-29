import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('late initial channel-count response cannot replace newer refreshed values',async()=>{
 const source=readFileSync(new URL('./public/explorer.js',import.meta.url),'utf8');
 const start=source.indexOf('let statsGeneration=0;const loadStats=async()=>{');
 const end=source.indexOf(";void api('/api/session')",start);
 assert.ok(start>=0&&end>start,'channel count loader should expose generation-guarded rendering');
 assert.match(source.slice(end,end+260),/statsButton\.onclick=async\(\)=>\{statsGeneration\+\+;/,'manual refresh invalidates the initial read immediately');
 const loader=source.slice(start,end),pending=[];
 const context={
  api:()=>new Promise(resolve=>pending.push(resolve)),d:{isConnected:true},id:'123@newsletter',
  statsState:{innerHTML:''},fmt:value=>value,esc:String
 };
 const loadStats=runInNewContext(`(()=>{${loader};return loadStats;})()`,context);
 const initial=loadStats();const refreshed=loadStats();
 assert.equal(pending.length,2);
 pending[1]({subscribers:{available:true,value:99},admin_count:{available:true,value:4},partial:false,observed:true,updated_at:'new'});
 await refreshed;
 const current=context.statsState.innerHTML;
 assert.match(current,/99/);
 pending[0]({subscribers:{available:true,value:10},admin_count:{available:true,value:1},partial:false,observed:true,updated_at:'old'});
 await initial;
 assert.equal(context.statsState.innerHTML,current);
});

test('late initial channel-count error cannot replace newer refreshed values',async()=>{
 const source=readFileSync(new URL('./public/explorer.js',import.meta.url),'utf8');
 const start=source.indexOf('let statsGeneration=0;const loadStats=async()=>{');
 const end=source.indexOf(";void api('/api/session')",start);
 assert.ok(start>=0&&end>start);
 const loader=source.slice(start,end),pending=[];
 const context={api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),d:{isConnected:true},id:'123@newsletter',statsState:{innerHTML:'',textContent:''},fmt:value=>value,esc:String};
 const loadStats=runInNewContext(`(()=>{${loader};return loadStats;})()`,context);
 const initial=loadStats().catch(()=>{}),refreshed=loadStats();
 pending[1].resolve({subscribers:{available:true,value:99},admin_count:{available:true,value:4},partial:false,observed:true,updated_at:'new'});
 await refreshed;
 const current=context.statsState.innerHTML;
 pending[0].reject(Error('stale failure'));
 await initial;
 assert.equal(context.statsState.innerHTML,current);
 assert.equal(context.statsState.textContent,'');
});
