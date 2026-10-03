import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('association selector scopes requests, resets paging and ignores stale responses',async()=>{
 const source=readFileSync(new URL('./public/explorer.js',import.meta.url),'utf8');
 const fn=source.split('\n').find(line=>line.startsWith('async function explorerPage('));
 const nodes=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}},textContent:'',innerHTML:'',insertAdjacentHTML(){}});return nodes.get(id);};
 const context={viewEpoch:1,paths:{labels:['Etiquetas','']},resources:{'label-associations':{title:'Asociaciones',endpoint:'label-associations',description:'Referencias observadas'},labels:{title:'Etiquetas'}},uiPrefs:{default_page_size:50},document:{getElementById:node,querySelectorAll:()=>[]},render(){},observedList:(endpoint,params)=>new Promise((resolve,reject)=>requests.push({endpoint,params,resolve,reject})),poll(){},debounce:f=>f,badge:()=>'',esc:String,fmt:String,isPublicCatalog:()=>false,empty:()=>'',table:()=>'',readable:String,rowName:()=>'',resourceDetail(){}};
 runInNewContext(fn,context);
 const result=(total)=>({rows:[],meta:{total,observed:true,collection_status:'observed_partial'}});
 const initial=context.explorerPage('labels','label-associations');assert.equal(requests[0].params.type,'chat');requests[0].resolve(result(0));await initial;
 const next=node('resource-next').onclick();assert.equal(requests[1].params.offset,50);
 const change=node('association-type').onchange({target:{value:'message'}});assert.equal(requests[2].params.type,'message');assert.equal(requests[2].params.offset,0);
 requests[2].resolve(result(2));await change;assert.equal(node('resource-count').textContent,'2 registros observados');
 requests[1].resolve(result(99));await next;assert.equal(node('resource-count').textContent,'2 registros observados');
 const emptyMessage=node('association-type').onchange({target:{value:'message'}});requests[3].resolve(result(0));await emptyMessage;assert.match(node('resource-status').innerHTML,/mensajes/);
 assert.match(source,/aria-label="Tipo de asociación"/);
 node('resource-table').innerHTML='previous chat rows';
 const failed=node('association-type').onchange({target:{value:'message'}});
 assert.equal(node('resource-table').innerHTML,'');assert.equal(node('resource-next').disabled,true);
 requests[4].reject(new Error('private error'));await failed;
 assert.equal(node('resource-table').innerHTML,'');assert.equal(node('resource-count').textContent,'Cantidad no disponible');assert.match(node('resource-status').textContent,/No se pudo cargar/);assert.doesNotMatch(node('resource-status').textContent,/private error/);
});
