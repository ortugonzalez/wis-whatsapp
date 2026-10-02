import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('overview indicators follow actual boolean configuration on initial render and polling',async()=>{
 let value=true,refresh;const nodes=new Map(),requests=[];
 const context={viewEpoch:1,state:{},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:''});return nodes.get(id);}},api:async path=>{requests.push(path);return {connection:{outbound_enabled:value},counts:{}};},list:async()=>({rows:[]}),render(){},poll:callback=>{refresh=callback;},esc:String,icon:()=>'',badge:text=>text,kv:(label,text)=>label+': '+text,fmt:()=>'',pageButton:()=>'',connectionStatus:()=>'',maskedConnectionLabel:()=>'',identityOk:()=>false,table:()=>'',operationRows:()=>[]};
 const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');runInNewContext(app.slice(app.indexOf('function outboundIndicator('),app.indexOf('async function overview(){')),context);
 const live=readFileSync(new URL('./public/live.js',import.meta.url),'utf8');runInNewContext(live.slice(live.indexOf('overview=async function(){'),live.indexOf('const inboxState=')),context);
 await context.overview();
 for(const [flag,text] of [[true,'Envíos habilitados por configuración'],[false,'Envíos deshabilitados'],[undefined,'Configuración de envíos no informada'],['false','Configuración de envíos no informada']]){
  value=flag;await refresh();assert.equal(nodes.get('live-outbound').innerHTML,text);assert.ok(nodes.get('live-connection').innerHTML.includes(text));
 }
 assert.ok(requests.every(path=>path==='/api/v1/overview'));
});
