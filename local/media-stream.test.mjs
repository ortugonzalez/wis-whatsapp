import test from 'node:test';import assert from 'node:assert/strict';import{Readable}from'node:stream';import{collectBoundedMedia}from'./bounded-media.mjs';
test('media collection preserves bytes at limit and destroys oversize streams without retaining remaining chunks',async()=>{
 const exact=Readable.from([Buffer.from('ab'),Buffer.from('cd')]);assert.equal((await collectBoundedMedia(exact,{maxBytes:4})).toString(),'abcd');
 const big=Readable.from([Buffer.from('abc'),Buffer.from('def'),Buffer.from('more')]);await assert.rejects(collectBoundedMedia(big,{maxBytes:4}),/too_large/);assert.equal(big.destroyed,true);
});
test('media cancellation destroys a stalled stream and rejects, including a stream arriving after abort',async()=>{
 const c=new AbortController(),stream=new Readable({read(){}}),result=collectBoundedMedia(stream,{signal:c.signal});c.abort();await assert.rejects(result);assert.equal(stream.destroyed,true);
 const late=new Readable({read(){}});await assert.rejects(collectBoundedMedia(late,{signal:c.signal}),/aborted/);assert.equal(late.destroyed,true);
});
test('media stream failure and invalid chunks never return a partial file',async()=>{
 const errorStream=Readable.from((async function*(){yield Buffer.from('abc');throw Error('fixture_failure');})());await assert.rejects(collectBoundedMedia(errorStream),/fixture_failure/);
 await assert.rejects(collectBoundedMedia(Readable.from(['text'])),/invalid_media_chunk/);
});
