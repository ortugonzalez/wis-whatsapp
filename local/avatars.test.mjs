import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {avatarFormat,cacheAvatar} from './avatars.mjs';
test('avatar media requires matching MIME/magic; downloader pins public DNS and keeps only private file metadata',async()=>{
 const bytes=Buffer.from([255,216,255,0]);assert.equal(avatarFormat(bytes,'image/jpeg').extension,'jpg');assert.throws(()=>avatarFormat(bytes,'image/png'));
 const directory=await mkdtemp(join(tmpdir(),'wis-avatar-'));
 const value=await cacheAvatar('https://mmg.whatsapp.net/image?token=FAKE',{directory,resolveDns:async()=>[{address:'8.8.8.8'}],requestImpl:(_url,options,callback)=>{
  options.lookup('mmg.whatsapp.net',{},(_err,ip)=>assert.equal(ip,'8.8.8.8'));
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{const res=new EventEmitter();res.headers={'content-type':'image/jpeg'};res.statusCode=200;res.destroy=()=>{};callback(res);res.emit('data',bytes);res.emit('end');};return req;
 }});
 assert.match(value.filename,/^[\da-f-]+\.jpg$/);assert.equal(value.size,4);assert.equal(JSON.stringify(value).includes('FAKE'),false);assert.deepEqual(await readFile(join(directory,value.filename)),bytes);
 await assert.rejects(cacheAvatar('https://evil.test/image',{directory}),/avatar_destination_rejected/);
 await assert.rejects(cacheAvatar('https://mmg.whatsapp.net/image',{directory,resolveDns:async()=>[{address:'127.0.0.1'}]}),/avatar_destination_rejected/);
});
test('avatar redirect and oversized replies are rejected without a second request',async()=>{
 for(const [status,headers,error] of [[302,{},'avatar_download_failed'],[200,{'content-length':String(2*1024*1024+1)},'avatar_too_large']]) {
  let calls=0;
  await assert.rejects(cacheAvatar('https://pps.whatsapp.net/image',{resolveDns:async()=>[{address:'8.8.8.8'}],requestImpl:(_url,_options,callback)=>{
   calls++;const req=new EventEmitter();req.destroy=()=>{};req.end=()=>callback({statusCode:status,headers,destroy(){}});return req;
  }}),new RegExp(error));assert.equal(calls,1);
 }
});
