import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../.local/',import.meta.url));
if(process.argv[2]!=='stop')throw Error('Uso: node local/control.mjs stop');
const runtime=JSON.parse(readFileSync(directory+'runtime.json','utf8'));
try{process.kill(runtime.pid,0);}catch{throw Error('No hay un supervisor local activo.');}
writeFileSync(directory+'stop-request',new Date().toISOString(),{mode:0o600});
console.log('Cierre local solicitado; se conservará la sesión.');
