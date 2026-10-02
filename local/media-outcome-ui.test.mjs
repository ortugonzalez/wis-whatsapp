import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('media outcome labels are allowlisted and do not claim expiry or current availability',()=>{
 const source=readFileSync(new URL('./public/messages.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function mediaDownloadDetails('),source.indexOf('receivedStructuredDetails=function'));
 const context={kv:(k,v)=>`${k}: ${v}`,fmt:x=>x};vm.createContext(context);vm.runInContext(fn,context);
 const render=data=>context.mediaDownloadDetails({type:'image'},data);
 assert.match(render({media_download:{status:'busy'}}),/otra descarga/);
 assert.match(render({media_download:{status:'saved'}}),/no una comprobación actual/);
 assert.match(render({}),/Sin resultado/);
 assert.doesNotMatch(render({media_download:{status:'private-provider-error'}}),/private-provider-error/);
 assert.equal(render({revoked:true,media_download:{status:'saved'}}),'');
 assert.equal(context.mediaDownloadDetails({type:'text'},{}),'');
});
