import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const directory=fileURLToPath(new URL('../.local/',import.meta.url));
if(!['stop','reload-api'].includes(process.argv[2]))throw Error('Uso: node local/control.mjs stop|reload-api');
const runtime=JSON.parse(readFileSync(directory+'runtime.json','utf8'));
try{process.kill(runtime.pid,0);}catch{throw Error('No hay un supervisor local activo.');}
if(process.argv[2]==='stop'){
 writeFileSync(directory+'stop-request',new Date().toISOString(),{mode:0o600});
 console.log('Cierre local solicitado; se conservará la sesión.');
}else{
 if(!runtime.worker_pid||!runtime.server_pid||runtime.stopping||['stopping_server','starting_server'].includes(runtime.reload?.status))throw Error('Supervisor incompatible u ocupado; no se solicitó recarga.');
 const id=randomUUID();writeFileSync(directory+'reload-api-request',JSON.stringify({id}),{mode:0o600,flag:'wx'});
 const until=Date.now()+40000;let done=false;
 while(Date.now()<until){await new Promise(r=>setTimeout(r,250));let latest;try{latest=JSON.parse(readFileSync(directory+'runtime.json','utf8'));}catch{continue;}
  if(latest.pid!==runtime.pid||latest.worker_pid!==runtime.worker_pid||latest.stopping)throw Error('La recarga no pudo confirmarse sin cambiar el worker.');
  if(latest.reload?.id===id){if(latest.reload.status==='failed')throw Error('La recarga falló.');if(latest.reload.status==='ready'&&latest.server_pid!==runtime.server_pid){done=true;break;}}
 }
 if(!done)throw Error('La recarga no fue confirmada dentro del plazo.');console.log('API recargada y lista; el proceso worker se conservó.');
}
