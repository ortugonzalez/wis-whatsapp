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
  checkhealth: ['/api/v1/connections', 'Estado del worker y conexión; no emula wakeup de WHAPI.'],
  loginuser: ['/settings/whatsapp', 'QR administrativo temporal; formato propio WIS.'],
  logoutuser: ['/api/whatsapp/disconnect', 'Cierre administrativo con sesión de navegador.'],
  getmessages: ['/api/v1/messages', 'Mensajes persistidos en WIS, paginación propia.'],
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
  row.screen = '/dashboard';
  row.test = 'Compilación y pruebas locales; validación WhatsApp real pendiente.';
}
mkdirSync('public', { recursive: true });
writeFileSync('public/whapi-capabilities.json', JSON.stringify({ captured_at: new Date().toISOString(), source, capabilities }, null, 2));
console.log(`Inventariados ${capabilities.length} métodos de WHAPI. No se declara paridad sin pruebas.`);
