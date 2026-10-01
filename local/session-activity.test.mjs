import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('only trusted user activity can request an authenticated session refresh',async()=>{
 const listeners=new Map(),requests=[];
 const document={hidden:false,getElementById:()=>({innerHTML:''}),addEventListener:(name,handler)=>listeners.set(name,handler)};
 const context={document,window:{addEventListener(){}},fetch:async(url,options)=>{requests.push({url,options});return {status:200};},Date,URL,console,setTimeout,clearTimeout,setInterval,clearInterval};
 vm.createContext(context);
 vm.runInContext(await readFile(new URL('./public/app.js',import.meta.url),'utf8'),context,{filename:'app.js'});
 vm.runInContext('state.authenticated=true',context);
 const handler=listeners.get('pointerdown');
 assert.equal(typeof handler,'function');
 handler({isTrusted:false});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,0);
 handler({isTrusted:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/api/session/refresh');
 assert.equal(requests[0].options.method,'POST');
});
