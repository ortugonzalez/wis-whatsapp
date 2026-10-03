import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./public/contact-avatar-summary.js',import.meta.url),'utf8');
function fixture(){
 const button={},result={textContent:'',innerHTML:''},section={isConnected:true,querySelector:s=>s.includes('refresh')?button:result};let mounted=false,calls=0,resolve,reject;
 const ctx={overview:async()=>{},viewEpoch:1,state:{page:'overview'},esc:s=>String(s).replaceAll('<','&lt;'),fmt:String,document:{getElementById:id=>id==='contact-avatar-summary'?(mounted?section:null):{after(){mounted=true;}},createElement:()=>section},api:()=>{calls++;return new Promise((r,j)=>{resolve=r;reject=j;});}};
 runInNewContext(source,ctx);return {ctx,button,result,section,calls:()=>calls,resolve:d=>resolve(d),reject:e=>reject(e)};
}
test('avatar card is opt-in, deduplicates in-flight reads and ignores stale navigation',async()=>{
 const f=fixture();await f.ctx.overview();assert.equal(f.calls(),0);
 const pending=f.button.onclick();await f.button.onclick();assert.equal(f.calls(),1);assert.equal(f.button.disabled,true);
 f.ctx.viewEpoch++;f.resolve({total_targets:99});await pending;assert.equal(f.result.innerHTML,'');assert.equal(f.button.disabled,false);
});
test('avatar card renders partial scope and escapes dates, errors expose no details',async()=>{
 const f=fixture();await f.ctx.overview();let pending=f.button.onclick();f.resolve({total_targets:1200,inspected_targets:1000,partial:true,checked_at:'<private>',cached_current:4});await pending;
 assert.match(f.result.innerHTML,/1000 de 1200/);assert.match(f.result.innerHTML,/muestra parcial/);assert.match(f.result.innerHTML,/&lt;private>/);assert.doesNotMatch(f.result.innerHTML,/<private>/);assert.match(f.result.innerHTML,/No confirma la firma/);
 pending=f.button.onclick();f.reject(Error('secret payload'));await pending;assert.doesNotMatch(f.result.textContent,/secret/);assert.match(f.result.textContent,/Volvé a intentar/);
});
