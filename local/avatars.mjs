import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isPublicIPv4} from './webhooks.mjs';

export function avatarFormat(bytes,mime) {
 const type=String(mime||'').split(';')[0].trim().toLowerCase();
 if(type==='image/jpeg'&&bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:type,extension:'jpg'};
 if(type==='image/png'&&bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:type,extension:'png'};
 if(type==='image/webp'&&bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {mime:type,extension:'webp'};
 throw Error('invalid_avatar_media');
}
export async function cacheAvatar(remote,{directory,allowedHosts=['mmg.whatsapp.net','pps.whatsapp.net'],resolveDns=lookup,requestImpl=request,authorized=()=>true}={}) {
 let url;try{url=new URL(remote);}catch{throw Error('avatar_destination_rejected');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!allowedHosts.includes(url.hostname))throw Error('avatar_destination_rejected');
 let dnsTimer,addresses;
 try{addresses=await Promise.race([resolveDns(url.hostname,{all:true,family:4}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('avatar_timeout')),4000);})]);}catch{throw Error('avatar_download_failed');}finally{clearTimeout(dnsTimer);}
 if(!addresses.length||addresses.some(x=>!isPublicIPv4(x.address))||!authorized())throw Error('avatar_destination_rejected');
 const result=await new Promise((accept,reject)=>{
  let settled=false,timer;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept(value);};
  const req=requestImpl(url,{method:'GET',lookup:(_host,options,cb)=>options?.all?cb(null,[{address:addresses[0].address,family:4}]):cb(null,addresses[0].address,4),headers:{Accept:'image/jpeg,image/png,image/webp'}},res=>{
   if(res.statusCode!==200){res.destroy();finish(Error('avatar_download_failed'));return;}
   if(Number(res.headers['content-length'])>2*1024*1024){res.destroy();finish(Error('avatar_too_large'));return;}
   let size=0;const chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){res.destroy();finish(Error('avatar_too_large'));}else chunks.push(chunk);});
   res.on('error',()=>finish(Error('avatar_download_failed')));
   res.on('end',()=>{try{const bytes=Buffer.concat(chunks);finish(null,{bytes,...avatarFormat(bytes,res.headers['content-type'])});}catch{finish(Error('invalid_avatar_media'));}});
  });
  timer=setTimeout(()=>{req.destroy();finish(Error('avatar_timeout'));},7000);
  req.on('error',()=>finish(Error('avatar_download_failed')));req.end();
 });
 if(!authorized())throw Error('connection_changed');
 await mkdir(directory,{recursive:true,mode:0o700});
 const filename=randomUUID()+'.'+result.extension;
 await writeFile(resolve(directory,filename),result.bytes,{flag:'wx',mode:0o600});
 return {filename,mime:result.mime,size:result.bytes.length};
}
