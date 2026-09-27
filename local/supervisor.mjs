import {randomUUID} from 'node:crypto';
export function createSupervisor({spawnChild,publish,exit,timeoutMs=15000}) {
 let server,worker,stopping=false,reloading=false,reload=null,timer,finished=false;
 const children=new Set(),started_at=new Date().toISOString();
 const alive=c=>c&&c.exitCode===null&&c.signalCode===null;
 const state=()=>publish({started_at,server_pid:server?.pid??null,worker_pid:worker?.pid??null,stopping,reload});
 const shutdown=c=>{if(alive(c)&&c.connected)c.send({type:'wis.shutdown'},()=>{});};
 function finish(){if(!finished&&stopping&&[...children].every(c=>!alive(c))){finished=true;clearTimeout(timer);exit(stopCode);}}
 let stopCode=0;
 function stop(code=0){if(stopping)return;stopping=true;stopCode=code;clearTimeout(timer);state();for(const c of children)shutdown(c);timer=setTimeout(()=>{for(const c of children)if(alive(c))c.kill();if(!finished){finished=true;exit(code);}},timeoutMs);finish();}
 function startChild(kind){const generation=randomUUID(),c=spawnChild(kind,generation);children.add(c);
  c.on('error',()=>{if(reload)reload={...reload,status:'failed',error:'child_start_failed'};state();stop(1);});
  c.on('exit',()=>{children.delete(c);if(stopping){finish();return;}if(kind==='server'&&c===server&&reloading&&reload?.status==='stopping_server'){clearTimeout(timer);reload={...reload,status:'starting_server'};server=startChild('server');state();timer=setTimeout(()=>fail('server_ready_timeout'),timeoutMs);return;}stop(1);});
  if(kind==='server')c.on('message',m=>{if(c!==server||stopping||m?.type!=='wis.ready'||m.generation!==generation)return;if(reloading&&reload?.status==='starting_server'){clearTimeout(timer);reloading=false;reload={...reload,status:'ready'};state();}});
  return c;
 }
 function fail(error){reload={...reload,status:'failed',error};state();stop(1);}
 function requestReload(id){if(stopping||reloading||id===reload?.id||!/^[0-9a-f-]{36}$/i.test(id))return false;reloading=true;reload={id,status:'stopping_server'};state();timer=setTimeout(()=>fail('server_exit_timeout'),timeoutMs);shutdown(server);return true;}
 server=startChild('server');worker=startChild('worker');state();
 return {stop,requestReload,getState:()=>({server_pid:server.pid,worker_pid:worker.pid,reload,stopping})};
}
