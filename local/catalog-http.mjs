// Public WhatsApp Business catalog only. No owner management, cookies, JS eval,
// credential persistence, arbitrary targets, automatic retries or auth bypass.
const ENDPOINT='https://graph.whatsapp.com/graphql/catalog';
const DOCS={catalog:'30445081048424116',collections:'9430970660362540'};
const DISCOVERY_SCAN_BUDGET_MS=40000;
const DISCOVERY_SCRIPT_TIMEOUT_MS=10000;
export class PublicCatalogError extends Error {
  constructor(code,status=null){super(code);this.name='PublicCatalogError';this.code=code;this.status_code=Number.isInteger(status)?status:null;}
}
function moduleSource(source,name) {
  const start=source.indexOf(`__d("${name}"`);
  if(start<0)return null;
  const end=source.indexOf('__d(',start+4);
  return source.slice(start,end<0?Math.min(source.length,start+200000):end);
}
function literalValue(literal) {
  try {return literal[0]==='"'?JSON.parse(literal):literal.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\');}catch{return null;}
}
export function extractPublicCatalogConfig(source) {
  const output={};
  const constants=moduleSource(source,'WAWebGraphQLConstants');
  if(constants) {
    // Resolve the exact exported variable, never take the first WA| literal:
    // this module can also contain a different WWW application credential.
    const match=constants.match(/\.WHATSAPP_GRAPHQL_CATALOG_ACCESS_TOKEN\s*=\s*([A-Za-z_$][\w$]*)/);
    if(match) {
      const variable=match[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const assignment=constants.match(new RegExp(`(?:\\bvar|\\blet|\\bconst|[,;])\\s*${variable}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`));
      const token=assignment?literalValue(assignment[1]):null;
      if(typeof token==='string' && /^WA\|[^\s]{1,4096}$/.test(token))output.token=token;
    }
  }
  for(const [kind,name] of [['catalog','WAWebQueryCatalogQuery.graphql'],['collections','WAWebQueryProductCollectionsQuery.graphql']]) {
    const sourceModule=moduleSource(source,name);
    const id=sourceModule?.match(/\bid\s*:\s*["'](\d{10,30})["']/)?.[1];
    if(id)output[kind]=id;
  }
  return output;
}
async function boundedText(response,maxBytes) {
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared) && declared>maxBytes)throw new PublicCatalogError('response_too_large');
  const reader=response.body?.getReader();
  if(!reader)return '';
  const chunks=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new PublicCatalogError('response_too_large');chunks.push(value);}
  } finally {await reader.cancel().catch(()=>{});}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(buffer);
}
function statusError(status) {
  return new PublicCatalogError(status===401 || status===403?'access_denied':status===429?'rate_limited':status===404?'not_found':'provider_http_error',status);
}
async function fetchText(fetchImpl,url,options,maxBytes,timeoutMs,timeoutCode='read_timeout') {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(url,{...options,credentials:'omit',redirect:'error',signal:controller.signal});
    if(!response.ok)throw statusError(response.status);
    return await boundedText(response,maxBytes);
  } catch(error) {
    if(error instanceof PublicCatalogError)throw error;
    throw new PublicCatalogError(controller.signal.aborted?timeoutCode:'transport_failed');
  } finally {clearTimeout(timer);}
}
export async function discoverPublicCatalogConfig({fetchImpl=fetch,maxScripts=60}={}) {
  const html=await fetchText(fetchImpl,'https://web.whatsapp.com/',{method:'GET'},2*1024*1024,15000);
  const urls=[...new Set([...html.matchAll(/(?:src|href)="([^"\s]+\.js(?:\?[^"\s]*)?)"/g)].map(x=>x[1].replaceAll('&amp;','&')))];
  const scripts=urls.filter(value=>{try {const u=new URL(value);return u.protocol==='https:' && u.hostname==='static.whatsapp.net' && !u.username && !u.password && !u.port;}catch{return false;}}).slice(0,Math.min(100,Math.max(1,maxScripts)));
  let index=0,totalBytes=0;const result={...DOCS};const started=Date.now();let transientFailures=0;
  async function scan() {
    while(index<scripts.length && !result.token && Date.now()-started<DISCOVERY_SCAN_BUDGET_MS && totalBytes<40*1024*1024) {
      const url=scripts[index++];
      let source;
      try {source=await fetchText(fetchImpl,url,{method:'GET'},8*1024*1024,DISCOVERY_SCRIPT_TIMEOUT_MS);}
      catch(error) {
        // WhatsApp publishes many static bundles; a stale CDN URL or one slow
        // bundle must not discard a valid token discovered by another worker.
        if(error instanceof PublicCatalogError && ['read_timeout','transport_failed','provider_http_error','not_found'].includes(error.code)) {transientFailures++;continue;}
        throw error;
      }
      totalBytes+=Buffer.byteLength(source);
      if(totalBytes>40*1024*1024)throw new PublicCatalogError('discovery_budget_exceeded');
      Object.assign(result,extractPublicCatalogConfig(source));
    }
  }
  const scans=await Promise.allSettled([scan(),scan(),scan()]);
  const failed=scans.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  if(!result.token)throw new PublicCatalogError(transientFailures?'read_timeout':'public_catalog_config_unavailable');
  return result;
}
function fields(value,names) {
  const out={};for(const name of names){const v=value?.[name];if(typeof v==='string')out[name]=v.slice(0,8192);else if(typeof v==='boolean' || v===null || (typeof v==='number' && Number.isFinite(v)))out[name]=v;}return out;
}
function plainObject(value) {
  return value!==null && typeof value==='object' && !Array.isArray(value) && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
}
function validId(value) {
  return (typeof value==='string' && value.trim().length>0 && value.length<=2048) || (typeof value==='number' && Number.isSafeInteger(value) && value>=0);
}
function validProduct(value) {
  return plainObject(value) && validId(value.id ?? value.product_id);
}
function product(value) {
  return {...fields(value,['id','product_id','name','description','retailer_id','retailerId','price','currency','availability','product_availability','is_hidden','isHidden']),id:value.id ?? value.product_id,...(value?.price && typeof value.price==='object'?{price:fields(value.price,['amount','currency'])}:{})};
}
function paging(value) {
  const after=value?.after ?? value?.cursors?.after;
  return {after:typeof after==='string'?after.slice(0,2048):null};
}
export function createPublicCatalogReader({ownJid,fetchImpl=fetch,discover=discoverPublicCatalogConfig,catalogTimeoutMs=30000}={}) {
  const jid=typeof ownJid==='string'?ownJid.replace(/:\d+(?=@)/,''):'';
  if(!/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(jid))throw new PublicCatalogError('invalid_own_jid');
  let configuration;
  async function query(kind,{after=null}={}) {
    if(after!==null && (typeof after!=='string' || after.length>2048))throw new PublicCatalogError('invalid_cursor');
    configuration ||= await discover({fetchImpl});
    if(!configuration?.token || !/^\d{10,30}$/.test(configuration[kind] || ''))throw new PublicCatalogError('public_catalog_config_unavailable');
    const shared={after,width:'100',height:'100',direct_connection_encrypted_info:null,variant_info_fields:null,variant_thumbnail_height:null,variant_thumbnail_width:null};
    const request=kind==='catalog'?{product_catalog:{jid,allow_shop_source:'ALLOWSHOPSOURCE_TRUE',limit:'50',catalog_session_id:null,...shared}}:{collections:{biz_jid:jid,collection_limit:'50',item_limit:'50',...shared}};
    const text=await fetchText(fetchImpl,ENDPOINT,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({access_token:configuration.token,doc_id:configuration[kind],lang:'en_US',variables:{request}})},4*1024*1024,catalogTimeoutMs,'public_catalog_http_timeout');
    let body;try{body=JSON.parse(text);}catch{throw new PublicCatalogError('invalid_json_response');}
    if(!plainObject(body))throw new PublicCatalogError('invalid_catalog_response');
    if(body.errors?.length || body.error) {
      const candidate=body.errors?.[0]?.code ?? body.errors?.[0]?.extensions?.code ?? body.error?.code;
      const failure=new PublicCatalogError(candidate===2498052?'public_catalog_unavailable':'graphql_error');
      if(Number.isSafeInteger(candidate))failure.provider_code=candidate;
      throw failure;
    }
    if(!plainObject(body.data))throw new PublicCatalogError('invalid_catalog_response');
    const payload=kind==='catalog'?body.data?.xwa_product_catalog_get_product_catalog?.product_catalog:body.data?.xwa_product_catalog_get_collections;
    const values=kind==='catalog'?payload?.products:payload?.collections;
    if(!plainObject(payload) || !Array.isArray(values))throw new PublicCatalogError('invalid_catalog_response');
    // Validate every row before declaring a verified response, including rows
    // beyond the display cap. A malformed result is never an empty catalog.
    const valid=kind==='catalog'?values.every(validProduct):values.every(c=>plainObject(c) && validId(c.id) && (c.products===undefined || (Array.isArray(c.products) && c.products.every(validProduct))));
    if(!valid)throw new PublicCatalogError('invalid_catalog_response');
    const result={scope:'public_catalog',source:'public_whatsapp_graphql',owner_jid:jid,response_verified:true,available:true,fetched_at:new Date().toISOString(),paging:paging(payload?.paging),truncated:values.length>50};
    if(kind==='catalog')result.products=values.slice(0,50).map(product);
    else result.collections=values.slice(0,50).map(c=>({...fields(c,['id','name']),...(Array.isArray(c.products)?{products:c.products.slice(0,50).map(product),products_truncated:c.products.length>50}:{products_collected:false})}));
    return result;
  }
  return Object.freeze({catalog:options=>query('catalog',options),collections:options=>query('collections',options)});
}
