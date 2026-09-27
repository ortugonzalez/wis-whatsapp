import { mkdirSync, writeFileSync } from 'node:fs';
const source = 'https://whapi.readme.io/llms.txt';
const response = await fetch(source);
if (!response.ok) throw new Error(`WHAPI index HTTP ${response.status}`);
const text = await response.text();
const entries = [...text.matchAll(/^- \[([^\]]+)\]\((https:\/\/whapi\.readme\.io\/reference\/[^)]+)\)/gm)];
const capabilities = entries.map(([, name, url]) => ({
  id: url.split('/').pop().replace(/\.md$/, ''), name, source: url,
  status: 'pending', endpoint: null, screen: '/dashboard',
  baileys: null, test: null,
  reason: 'Método inventariado. Sin prueba de equivalencia; no disponible como endpoint WIS.'
}));
const implemented = {
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
for (const row of capabilities) if (implemented[row.id]) {
  row.status = 'partial';
  row.endpoint = implemented[row.id][0];
  row.reason = implemented[row.id][1];
  row.screen = '/#capabilities';
  row.test = 'Pruebas locales por módulo y evidencia operativa en docs/sqlite-delivery.md; equivalencia completa no verificada.';
}
mkdirSync('public', { recursive: true });
writeFileSync('public/whapi-capabilities.json', JSON.stringify({ captured_at: new Date().toISOString(), source, capabilities }, null, 2));
console.log(`Inventariados ${capabilities.length} métodos de WHAPI. No se declara paridad sin pruebas.`);
