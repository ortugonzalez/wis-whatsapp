import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=await readFile(new URL('./public/group-invite.js',import.meta.url),'utf8');

test('late community detail response never attaches its invite card to a newer drawer',async()=>{
 let currentDrawer=null,resolveFirst,sessionCalls=0;
 const firstPending=new Promise(resolve=>{resolveFirst=resolve;});
 const firstDrawer={isConnected:true},newerDrawer={isConnected:true};
 const context={
  groupDetails(){},viewEpoch:1,window:{addEventListener(){},removeEventListener(){}},
  document:{querySelector(selector){return selector==='.detail-drawer'?currentDrawer:null;}},
  api:async()=>{sessionCalls++;return {admin:false};},
  resourceDetail(_resource,row){currentDrawer=row.id==='A'?firstDrawer:newerDrawer;return row.id==='A'?firstPending:Promise.resolve();},
 };
 runInNewContext(source,context);
 const first=context.resourceDetail('communities',{id:'A'});
 assert.equal(currentDrawer,firstDrawer);
 currentDrawer=newerDrawer;
 resolveFirst();
 await first;
 assert.equal(sessionCalls,0);
});
