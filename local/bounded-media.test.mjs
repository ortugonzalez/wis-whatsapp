import test from 'node:test';import assert from 'node:assert/strict';import {createBoundedMediaDownload} from './bounded-media.mjs';
test('media timeout releases caller but fences another download until original settles',async()=>{
 const d=createBoundedMediaDownload({timeoutMs:10});let complete,signal,calls=0;
 await assert.rejects(d.run(s=>{calls++;signal=s;return new Promise(r=>complete=r);}),/aborted/);assert.equal(signal.aborted,true);
 await assert.rejects(d.run(()=>{calls++;}),/unresolved/);assert.equal(calls,1);complete(Buffer.from('late'));await new Promise(r=>setImmediate(r));assert.equal(await d.run(()=>Promise.resolve('next')),'next');d.stop();await assert.rejects(d.run(()=>{}),/stopped/);
});
test('stop aborts an active media caller even when the provider ignores cancellation',async()=>{
 const d=createBoundedMediaDownload();let started;const ready=new Promise(r=>started=r),pending=d.run(()=>{started();return new Promise(()=>{});});await ready;d.stop();await assert.rejects(pending,/aborted/);
});
test('late rejection after stop is handled and normal downloads retain their bytes',async()=>{
 const normal=createBoundedMediaDownload();assert.deepEqual(await normal.run(()=>Buffer.from('fixture')),Buffer.from('fixture'));normal.stop();
 const d=createBoundedMediaDownload();let rejectLate,started;const ready=new Promise(r=>started=r);const request=d.run(()=>new Promise((_,reject)=>{rejectLate=reject;started();}));await ready;d.stop();await assert.rejects(request,/aborted/);rejectLate(Error('late-provider-error'));await new Promise(r=>setImmediate(r));
});
