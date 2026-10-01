import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

const source=await readFile(new URL('./public/login-status.js',import.meta.url),'utf8');

async function renderStatus(data){
 const status={dataset:{},setAttribute(){},textContent:''};
 const box={isConnected:true,querySelector:()=>status,append(){}};
 const root={querySelector:selector=>selector==='.login-box'?box:status};
 const context={document:{getElementById:()=>root,createElement:()=>({dataset:{},setAttribute(){},className:'',textContent:''})},MutationObserver:class{observe(){}},setInterval(){},fetch:async()=>({ok:true,json:async()=>({data})})};
 runInNewContext(source,context);
 await new Promise(resolve=>setTimeout(resolve,0));
 return status.textContent;
}

test('a connected WhatsApp line tells the user that dashboard login is separate and a QR scan is unnecessary',async()=>{
 const message=await renderStatus({status:'connected',error:null,last_disconnect:null});
 assert.match(message,/El acceso al panel es independiente/);
 assert.match(message,/iniciá sesión para ver tus datos/);
 assert.match(message,/No hace falta escanear otro QR/);
});

test('a historical replaced connection does not hide a new QR prompt',async()=>{
 const message=await renderStatus({status:'qr_pending',error:null,last_disconnect:{reason:'connection_replaced',status_code:440}});
 assert.match(message,/espera el escaneo de su QR/);
 assert.doesNotMatch(message,/reconexión local está inestable/);
});

test('an active reconnect displays the safe replacement guidance',async()=>{
 const message=await renderStatus({status:'qr_pending',error:'reconnecting',last_disconnect:{reason:'connection_replaced',status_code:440}});
 assert.match(message,/WhatsApp reemplazó esta conexión/);
 assert.match(message,/Revisá Dispositivos vinculados/);
});

test('an exhausted local connection clarifies that another panel QR is a separate session',async()=>{
 const message=await renderStatus({status:'disconnected',error:'reconnect_exhausted',last_disconnect:{reason:'connection_replaced',status_code:440}});
 assert.match(message,/otra instalación de WIS no se transfiere a este panel/);
});

test('a revoked session does not promise an immediate QR before controlled recovery',async()=>{
 const message=await renderStatus({status:'disconnected',error:'session_revoked',last_disconnect:{reason:'logged_out',status_code:401}});
 assert.match(message,/WhatsApp rechazó las credenciales guardadas/);
 assert.match(message,/Todavía no hay un QR nuevo/);
 assert.match(message,/recuperación controlada/);
});
