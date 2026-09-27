// Extract structural identifiers from WHAPI public OpenAPI pages, without examples or prose.
import {readFileSync,writeFileSync} from 'node:fs';
const inventory=JSON.parse(readFileSync('public/whapi-capabilities.json','utf8'));
const results=[];let cursor=0;
function resolveRef(doc,node){return node?.$ref?.startsWith('#/')?node.$ref.slice(2).split('/').reduce((a,k)=>a?.[k],doc):node;}
function fields(doc,node,prefix='',depth=0,seen=new Set()){
 if(!node||depth>10)return [];
 if(node.$ref){if(seen.has(node.$ref))return [];seen=new Set(seen).add(node.$ref);node=resolveRef(doc,node);}
 if(!node)return [];
 const out=[];
 for(const [key,value] of Object.entries(node.properties||{})){
  const path=prefix?prefix+'.'+key:key, schema=resolveRef(doc,value)||{};
  out.push({path,type:schema.type||'object',required:(node.required||[]).includes(key),...(schema.enum?{enum:schema.enum}:{})});
  out.push(...fields(doc,value,path,depth+1,seen));
 }
 if(node.items)out.push(...fields(doc,node.items,prefix+'[]',depth+1,seen));
 for(const key of ['allOf','oneOf','anyOf'])for(const item of node[key]||[])out.push(...fields(doc,item,prefix,depth+1,seen));
 return out;
}
async function consume(){while(cursor<inventory.capabilities.length){const cap=inventory.capabilities[cursor++];try{
 const response=await fetch(cap.source,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('http_'+response.status);
 const markdown=await response.text(),match=/```json\s*([\s\S]*?)```/.exec(markdown);if(!match)throw Error('schema_unavailable');
 const doc=JSON.parse(match[1]);const operations=[];
 for(const [path,methods] of Object.entries(doc.paths||{}))for(const [method,op] of Object.entries(methods)){
  if(!['get','post','put','patch','delete'].includes(method))continue;
  const request=resolveRef(doc,op.requestBody);const outputs={};
  for(const [status,r] of Object.entries(op.responses||{})){if(!status.startsWith('2'))continue;const response=resolveRef(doc,r);outputs[status]=Object.values(response?.content||{}).flatMap(c=>fields(doc,c.schema));}
  operations.push({method:method.toUpperCase(),path,operation_id:op.operationId,tags:op.tags||[],parameters:(op.parameters||[]).map(p=>resolveRef(doc,p)).map(p=>({name:p.name,in:p.in,required:!!p.required,type:p.schema?.type})),request_fields:Object.values(request?.content||{}).flatMap(c=>fields(doc,c.schema)),response_fields:outputs});
 }
 results.push({id:cap.id,source:cap.source,version:doc.info?.version,operations});
 }catch(error){results.push({id:cap.id,source:cap.source,error:error.name==='TimeoutError'?'timeout':error.message});}}}
await Promise.all(Array.from({length:4},consume));
results.sort((a,b)=>a.id.localeCompare(b.id));
writeFileSync('public/whapi-fields.json',JSON.stringify({captured_at:new Date().toISOString(),source:inventory.source,methods:results},null,2));
console.log(JSON.stringify({methods:results.length,extracted:results.filter(x=>!x.error).length,failed:results.filter(x=>x.error).map(x=>({id:x.id,error:x.error}))}));
