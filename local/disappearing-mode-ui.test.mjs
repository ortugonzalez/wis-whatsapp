import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('active chat detail loads a bounded manual disappearing-mode read control',async()=>{
 const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('src=/chat-details.js')<html.indexOf('src=/disappearing-mode.js'));
 const script=readFileSync(new URL('./public/disappearing-mode.js',import.meta.url),'utf8'),button={disabled:false,textContent:'',handler:null,addEventListener(_event,handler){this.handler=handler;}},sections=[];
 const body={append(section){sections.push(section);}},drawer={isConnected:true,open:true,dataset:{conversationId:'known-chat'},close(){this.open=false;},remove(){this.isConnected=false;},querySelector(selector){return selector==='.drawer-body'?body:null;}};let statusResolver,originalCalls=0;
 const context={conversationDetails:async()=>{originalCalls++;},document:{querySelector:()=>drawer,createElement:()=>({className:'',innerHTML:'',querySelector:selector=>selector==='[data-read-disappearing]'?button:null})},api:async(path,method,bodyArg)=>{
  if(path.startsWith('/api/v1/conversations'))return {conversation:{wa_chat_id:'123@s.whatsapp.net'},snapshots:[]};
  if(path.startsWith('/api/v1/disappearing-mode'))return {command:null};
  if(path==='/api/whatsapp/connection')return {status:'connected',identity_verified:true};
  if(path==='/api/v1/sync'&&method==='POST'){assert.equal(JSON.stringify(bodyArg),JSON.stringify({kind:'disappearing_mode',target:'123@s.whatsapp.net'}));return {id:'read-1'};}
  if(path==='/api/v1/sync?id=read-1')return new Promise(resolve=>{statusResolver=resolve;});
  throw Error('unexpected_api_route');
 },badge:()=>'',kv:()=>'',fmt:()=>'',esc:String,toast:()=>{},showError:error=>{throw Error(error);},errorCopy:{}};
 runInNewContext(script,context);
 await context.conversationDetails('known-chat');
 assert.equal(sections.length,1);assert.match(sections[0].innerHTML,/Modo de expiración informado para este JID/);assert.match(sections[0].innerHTML,/no demuestra por sí sola/);assert.equal(button.disabled,false);
 const request=button.handler();while(!statusResolver)await new Promise(resolve=>setImmediate(resolve));drawer.open=false;statusResolver({status:'done'});await request;assert.equal(originalCalls,1);
});
