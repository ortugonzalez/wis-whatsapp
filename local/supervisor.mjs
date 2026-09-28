import {randomUUID} from 'node:crypto';
import {validGroupInviteCode} from './group-invite-info.mjs';
import {validNewsletterInviteCode} from './newsletter-invite-info.mjs';
export function createSupervisor({spawnChild,publish,exit,timeoutMs=15000}) {
 let server,worker,stopping=false,reloading=false,reload=null,timer,finished=false;
 const children=new Set(),started_at=new Date().toISOString();
 const inviteRequests=new Map();
 const newsletterInviteRequests=new Map();
 const alive=c=>c&&c.exitCode===null&&c.signalCode===null;
 const state=()=>publish({started_at,server_pid:server?.pid??null,worker_pid:worker?.pid??null,stopping,reload});
 const shutdown=c=>{if(alive(c)&&c.connected)c.send({type:'wis.shutdown'},()=>{});};
 const replyInvite=(requestId,error,result)=>{
  const pending=inviteRequests.get(requestId);if(!pending)return;
  clearTimeout(pending.timer);inviteRequests.delete(requestId);
  if(alive(pending.server)&&pending.server.connected)pending.server.send({type:'wis.group_invite_info.response',request_id:requestId,...(error?{error}:{result})},()=>{});
 };
 const rejectInvite=(c,requestId,error)=>{if(alive(c)&&c.connected)c.send({type:'wis.group_invite_info.response',request_id:requestId,error},()=>{});};
 const replyNewsletterInvite=(requestId,error,result)=>{
  const pending=newsletterInviteRequests.get(requestId);if(!pending)return;
  clearTimeout(pending.timer);newsletterInviteRequests.delete(requestId);
  if(alive(pending.server)&&pending.server.connected)pending.server.send({type:'wis.newsletter_invite_info.response',request_id:requestId,...(error?{error}:{result})},()=>{});
 };
 const rejectNewsletterInvite=(c,requestId,error)=>{if(alive(c)&&c.connected)c.send({type:'wis.newsletter_invite_info.response',request_id:requestId,error},()=>{});};
 function handleServerMessage(c,message){
  if(c!==server||typeof message?.request_id!=='string'||!/^[0-9a-f-]{36}$/i.test(message.request_id))return;
  if(message.type==='wis.group_invite_info.request'){
   if(!validGroupInviteCode(message.invite_code)){rejectInvite(c,message.request_id,'invalid_invite_code');return;}
   if(inviteRequests.has(message.request_id)||inviteRequests.size||newsletterInviteRequests.size){rejectInvite(c,message.request_id,'previous_read_unresolved');return;}
   if(stopping||!alive(worker)||!worker.connected){rejectInvite(c,message.request_id,'connection_unavailable');return;}
   const pending={server:c,timer:setTimeout(()=>replyInvite(message.request_id,'read_timeout'),Math.max(timeoutMs,35000))};inviteRequests.set(message.request_id,pending);
   try{worker.send({type:'wis.group_invite_info.lookup',request_id:message.request_id,invite_code:message.invite_code},error=>{if(error)replyInvite(message.request_id,'connection_unavailable');});}catch{replyInvite(message.request_id,'connection_unavailable');}
  }else if(message.type==='wis.newsletter_invite_info.request'){
   if(!validNewsletterInviteCode(message.invite_code)){rejectNewsletterInvite(c,message.request_id,'invalid_invite_code');return;}
   if(newsletterInviteRequests.has(message.request_id)||inviteRequests.size||newsletterInviteRequests.size){rejectNewsletterInvite(c,message.request_id,'previous_read_unresolved');return;}
   if(stopping||!alive(worker)||!worker.connected){rejectNewsletterInvite(c,message.request_id,'connection_unavailable');return;}
   const pending={server:c,timer:setTimeout(()=>replyNewsletterInvite(message.request_id,'read_timeout'),Math.max(timeoutMs,35000))};newsletterInviteRequests.set(message.request_id,pending);
   try{worker.send({type:'wis.newsletter_invite_info.lookup',request_id:message.request_id,invite_code:message.invite_code},error=>{if(error)replyNewsletterInvite(message.request_id,'connection_unavailable');});}catch{replyNewsletterInvite(message.request_id,'connection_unavailable');}
  }
 }
 function handleWorkerMessage(c,message){
  if(c!==worker||typeof message?.request_id!=='string')return;
  if(message.type==='wis.group_invite_info.result'){
   const error=['read_timeout','previous_read_unresolved','connection_unavailable','connection_changed','capability_unavailable','invalid_group_metadata_response'].includes(message.error)?message.error:message.error?'read_failed':null;replyInvite(message.request_id,error,message.result);
  }else if(message.type==='wis.newsletter_invite_info.result'){
   const error=['read_timeout','previous_read_unresolved','connection_unavailable','connection_changed','capability_unavailable','invalid_newsletter_metadata_response','newsletter_unavailable','invalid_invite_code'].includes(message.error)?message.error:message.error?'read_failed':null;replyNewsletterInvite(message.request_id,error,message.result);
  }
 }
 function clearInviteRequests(){for(const [requestId] of inviteRequests)replyInvite(requestId,'connection_unavailable');for(const [requestId] of newsletterInviteRequests)replyNewsletterInvite(requestId,'connection_unavailable');}
 function finish(){if(!finished&&stopping&&[...children].every(c=>!alive(c))){finished=true;clearTimeout(timer);exit(stopCode);}}
 let stopCode=0;
 function stop(code=0){if(stopping)return;stopping=true;stopCode=code;clearTimeout(timer);clearInviteRequests();state();for(const c of children)shutdown(c);timer=setTimeout(()=>{for(const c of children)if(alive(c))c.kill();if(!finished){finished=true;exit(code);}},timeoutMs);finish();}
 function startChild(kind){const generation=randomUUID(),c=spawnChild(kind,generation);children.add(c);
  c.on('error',()=>{if(reload)reload={...reload,status:'failed',error:'child_start_failed'};state();stop(1);});
  c.on('exit',()=>{children.delete(c);if(stopping){finish();return;}if(kind==='server'&&c===server&&reloading&&reload?.status==='stopping_server'){clearTimeout(timer);reload={...reload,status:'starting_server'};server=startChild('server');state();timer=setTimeout(()=>fail('server_ready_timeout'),timeoutMs);return;}stop(1);});
  if(kind==='server')c.on('message',m=>{handleServerMessage(c,m);if(c!==server||stopping||m?.type!=='wis.ready'||m.generation!==generation)return;if(reloading&&reload?.status==='starting_server'){clearTimeout(timer);reloading=false;reload={...reload,status:'ready'};state();}});
  if(kind==='worker')c.on('message',m=>handleWorkerMessage(c,m));
  return c;
 }
 function fail(error){reload={...reload,status:'failed',error};state();stop(1);}
 function requestReload(id){if(stopping||reloading||id===reload?.id||!/^[0-9a-f-]{36}$/i.test(id))return false;reloading=true;reload={id,status:'stopping_server'};state();timer=setTimeout(()=>fail('server_exit_timeout'),timeoutMs);shutdown(server);return true;}
 server=startChild('server');worker=startChild('worker');state();
 return {stop,requestReload,getState:()=>({server_pid:server.pid,worker_pid:worker.pid,reload,stopping})};
}
