export function createBoundedMediaDownload({timeoutMs=15000}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>120000)throw Error('invalid_media_timeout');
 let pending=null,controller=null,closed=false;
 return {
  async run(download){
   if(closed)throw Error('media_stopped');
   if(pending)throw Error('media_download_unresolved');
   const current=new AbortController();controller=current;
   const request=Promise.resolve().then(()=>{if(current.signal.aborted)throw Error('media_download_aborted');return download(current.signal);});pending=request;
   void request.finally(()=>{if(pending===request){pending=null;if(controller===current)controller=null;}}).catch(()=>{});
   let onAbort;const aborted=new Promise((_,reject)=>{onAbort=()=>reject(Error('media_download_aborted'));current.signal.addEventListener('abort',onAbort,{once:true});});
   const timer=setTimeout(()=>current.abort(),timeoutMs);
   try{return await Promise.race([request,aborted]);}
   finally{clearTimeout(timer);current.signal.removeEventListener('abort',onAbort);}
  },
  stop(){closed=true;controller?.abort();}
 };
}
