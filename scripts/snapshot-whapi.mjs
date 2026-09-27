import { mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const source = 'https://whapi.readme.io/llms.txt';
export function parseEntries(text) {
 if(typeof text!=='string')throw new Error('Invalid WHAPI index');
 const entries=[...text.matchAll(/^- \[([^\]]+)\]\((https:\/\/whapi\.readme\.io\/reference\/[^)]+)\)/gm)].map(([,name,url])=>({id:url.split('/').pop().replace(/\.md$/, ''),name,source:url}));
 validateEntries(entries);return entries;
}
function validateEntries(entries){
 if(!Array.isArray(entries)||!entries.length)throw new Error('Empty WHAPI index');
 const ids=new Set();for(const row of entries){if(!row||typeof row.id!=='string'||! /^[a-z0-9][a-z0-9_-]*$/.test(row.id)||typeof row.name!=='string'||!row.name.trim()||typeof row.source!=='string'||! /^https:\/\/whapi\.readme\.io\/reference\/[a-z0-9][a-z0-9_-]*(?:\.md)?$/.test(row.source)||row.source.split('/').pop().replace(/\.md$/,'')!==row.id)throw new Error('Invalid WHAPI entry');if(ids.has(row.id))throw new Error('Duplicate WHAPI ID: '+row.id);ids.add(row.id);}
}
const implemented = {
  getproduct: ['/api/v1/products?id=ID', 'Detalle exacto de producto persistido y alcance del catálogo consultado. Sin consulta individual remota, imágenes ni edición; validación real pendiente en esta cuenta.'],
  getcollection: ['/api/v1/collections?id=ID', 'Detalle exacto de colección persistida, sin modificarla ni prometer catálogo completo. Validación con fixtures; sin colecciones reales recibidas en esta cuenta.'],
  getcollectionproductlist: ['/api/v1/collection-products?collection_id=ID', 'Productos explícitamente recibidos dentro de una colección, con paginación local y recopilación ausente diferenciada. No recupera páginas remotas.'],
  getmessagesnewsletter: ['/api/v1/channel-messages?target=JID', 'Consulta manual acotada a 50 mensajes de un canal conocido, con texto y metadatos locales. Formato real pendiente de validar en esta cuenta; sin historial completo, medios ni suscripciones.'],
  getchat: ['/api/v1/conversations?id=UUID', 'Detalle local, metadatos y recuentos del historial recibido. No garantiza el historial completo del dispositivo.'],
  getcontact: ['/api/v1/contacts?id=UUID', 'Detalle de contacto local, perfil observado y conversaciones relacionadas por identificadores exactos, sin fusionar consentimiento.'],
  getnewchatlimit: ['/api/v1/account-limits', 'Consulta administrativa de cuotas reportadas por WhatsApp; desconocido si no hay respuesta válida. No recomienda un volumen seguro de envíos.'],
  getreachouttimelock: ['/api/v1/account-limits', 'Restricción temporal reportada por el proveedor, con campos ausentes explícitos. No cambia políticas ni habilita envíos.'],
  getcommunity: ['/api/v1/communities?id=JID', 'Detalle local de una comunidad observada; campos disponibles sin modificar membresía.'],
  getcommunitysubgroups: ['/api/v1/community-subgroups?target=JID', 'Subgrupos de una comunidad conocida, con consulta de lectura validada y disponibilidad explícita.'],
  getgroupapplicationslist: ['/api/v1/group-requests?target=JID', 'Solicitudes de ingreso consultadas para un grupo conocido; depende de permisos y respuesta de WhatsApp. Sin aprobar ni rechazar.'],
  getstories: ['/api/v1/stories', 'Estados vigentes recibidos por la sesión, texto y metadatos locales. Sin recuperación completa, descargas ni confirmaciones de lectura.'],
  getstory: ['/api/v1/stories?id=ID', 'Detalle local de un estado observado no vencido ni revocado; sin medios ni publicación.'],
  getlidbyids: ['/api/v1/identities', 'Inventario local paginado de relaciones LID/PN observadas; sin resolución remota de números arbitrarios.'],
  getlidbyid: ['/api/v1/identities?pn=PN', 'Consulta por PN observado; los conflictos se conservan, sin prometer una relación única.'],
  getidbylid: ['/api/v1/identities?lid=LID', 'Consulta por LID observado; no se calcula un teléfono desde los dígitos de un LID.'],
  getcall: ['/api/v1/calls?id=ID', 'Llamadas observadas por la sesión y persistidas localmente; no recupera el historial completo ni inicia llamadas.'],
  checkhealth: ['/api/v1/connections', 'Estado del worker y conexión; no emula wakeup de WHAPI.'],
  loginuser: ['/api/whatsapp/qr', 'QR administrativo temporal; formato propio WIS.'],
  logoutuser: ['/api/whatsapp/logout', 'Cierre administrativo con sesión de navegador.'],
  getuserprofile: ['/api/v1/account', 'Snapshot de perfil de la cuenta vinculada; campos disponibles dependen de WhatsApp.'],
  getbusinessprofile: ['/api/v1/account', 'Snapshot Business si la cuenta y WhatsApp lo permiten; sin edición.'],
  getgroups: ['/api/v1/groups', 'Metadatos disponibles de grupos participantes, consultados por el worker.'],
  getgroup: ['/api/v1/groups', 'Detalle en snapshot; refresco de lectura mediante /api/v1/sync.'],
  getgroupicon: ['/api/v1/avatars?target=JID', 'Lectura manual de foto de un grupo conocido, con caché privada autenticada. Depende de visibilidad y respuesta de WhatsApp; sin edición.'],
  getcontactprofile: ['/api/v1/snapshots', 'Snapshots de perfil solicitado por lectura; sin garantía de datos privados.'],
  getcontactabout: ['/api/v1/snapshots', 'Acerca de cuando WhatsApp permite consultarlo.'],
  getpresence: ['/api/v1/snapshots', 'Eventos de presencia entregados por WhatsApp; no seguimiento garantizado.'],
  getallowedevents: ['/api/v1/webhook-events', 'Contrato de los tres eventos emitidos por WIS; diferencia las categorías de referencia WHAPI. Entrega externa desactivada hasta aprobación.'],
  getchannelsettings: ['/api/v1/settings', 'Preferencias locales de WIS, no configuración remota equivalente WHAPI.'],
  getmedia: ['/api/v1/media', 'Lectura privada de archivos realmente descargados; medios históricos pueden no estar disponibles.'],
  getproducts: ['/api/v1/products', 'Catálogo público visible de la cuenta propia; indica error, alcance parcial y truncamiento. No expone administración ni productos ocultos.'],
  getcollectionslist: ['/api/v1/collections', 'Colecciones públicas visibles de la cuenta propia; respuesta vacía verificada en esta cuenta. No replica el catálogo privado ni su edición.'],
  getlabels: ['/api/v1/labels', 'Etiquetas recibidas por eventos de WhatsApp; inventario histórico completo no garantizado.'],
  getlabelassociations: ['/api/v1/label-associations', 'Asociaciones que la sesión haya recibido; no crea ni modifica etiquetas.'],
  getblacklist: ['/api/v1/blocklist', 'Consulta administrativa de bloqueados, sin altas ni bajas.'],
  getcommunities: ['/api/v1/communities', 'Comunidades identificadas entre los grupos entregados por WhatsApp.'],
  getnewsletters: ['/api/v1/channels', 'Canales ya conocidos por esta sesión; sin descubrimiento global.'],
  getnewsletter: ['/api/v1/channels', 'Metadatos de un canal conocido; sin seguirlo ni modificar sus propiedades.'],
  getmessages: ['/api/v1/messages', 'Mensajes persistidos en WIS, paginación propia.'],
  getmessage: ['/api/v1/messages?id=UUID', 'Detalle local con cita, menciones, reacciones y recibos observados; no recupera campos históricos ausentes.'],
  getmessageviewstatuses: ['/api/v1/messages?id=UUID', 'Recibos por participante recibidos desde la vinculación; no garantiza listado completo de visualizaciones.'],
  getmediafiles: ['/api/v1/media', 'Inventario paginado de archivos registrados localmente, con acceso autenticado; no lista todo el almacenamiento remoto.'],
  getmessagesbychatid: ['/api/v1/messages', 'Filtro por conversación WIS.'],
  sendmessagetext: ['/api/v1/messages', 'Envío en cola con consentimiento e idempotencia; deshabilitado hasta prueba autorizada.'],
  sendmessageimage: ['/api/v1/messages', 'Multimedia desde almacenamiento privado WIS; pendiente prueba real.'],
  sendmessageaudio: ['/api/v1/messages', 'Multimedia desde almacenamiento privado WIS; pendiente prueba real.'],
  sendmessagedocument: ['/api/v1/messages', 'Multimedia desde almacenamiento privado WIS; pendiente prueba real.'],
  uploadmedia: ['/api/v1/media', 'Carga con alcance de conexión; formato propio WIS.'],
  getcontacts: ['/api/v1/contacts', 'Contactos persistidos, consentimiento y bajas.'],
  getchats: ['/api/v1/conversations', 'Conversaciones persistidas.'],
};
export function buildSnapshot(entries, previous = {}, capturedAt = new Date().toISOString()) {
 validateEntries(entries);
 if(!previous||typeof previous!=='object'||Array.isArray(previous))throw new Error('Invalid previous snapshot');
 if(!Number.isFinite(Date.parse(capturedAt)))throw new Error('Invalid capture timestamp');
 const prior=new Map((previous.capabilities??[]).map(row=>[row.id,row]));
 const incoming=new Set(entries.map(row=>row.id));
 if([...prior.keys()].some(id=>!incoming.has(id)))throw new Error('WHAPI index omits previously inventoried IDs; review removals before regeneration');
 const capabilities=entries.map(entry=>{
  const row={...entry,status:'pending',endpoint:null,screen:'/dashboard',baileys:null,test:null,reason:'Método inventariado. Sin prueba de equivalencia; no disponible como endpoint WIS.'};
  if(implemented[row.id]){row.status='partial';row.endpoint=implemented[row.id][0];row.reason=implemented[row.id][1];row.screen='/#capabilities';row.test='Pruebas locales por módulo y evidencia operativa en docs/sqlite-delivery.md; equivalencia completa no verificada.';}
  const existing=prior.get(row.id);if(existing&&Object.hasOwn(existing,'baileys_audit'))row.baileys_audit=structuredClone(existing.baileys_audit);
  return row;
 });
 return {...structuredClone(previous),captured_at:capturedAt,source,capabilities};
}
export async function main(){
 const destination=resolve(root,'public/whapi-capabilities.json');
 let previous={};try{previous=JSON.parse(readFileSync(destination,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const response=await fetch(source,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('WHAPI index HTTP '+response.status);
 const result=buildSnapshot(parseEntries(await response.text()),previous);
 mkdirSync(dirname(destination),{recursive:true});const temporary=destination+'.'+randomUUID()+'.tmp';
 try{writeFileSync(temporary,JSON.stringify(result,null,2)+'\n',{flag:'wx'});renameSync(temporary,destination);}finally{try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
 console.log('Inventariados '+result.capabilities.length+' métodos de WHAPI. Auditoría previa conservada sin nueva revisión.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
