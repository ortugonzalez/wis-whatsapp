import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const matrix=read('public/whapi-capabilities.json');
const version=read('node_modules/baileys/package.json').version;
const rows=[0,1,2].flatMap(i=>read(`docs/baileys-audit-${i}.json`));
const ids=new Set(matrix.capabilities.map(row=>row.id)),seen=new Set();
for(const row of rows){
 if(!ids.has(row.id)||seen.has(row.id))throw Error('Unexpected or duplicate audit ID: '+row.id);
 seen.add(row.id);
 if(!['candidate','local_only','no_public_method_found'].includes(row.support)||!row.reason||!row.next_step||!Array.isArray(row.methods))throw Error('Incomplete audit: '+row.id);
 if(row.support==='candidate'&&!row.methods.length)throw Error('Candidate without evidence: '+row.id);
 for(const evidence of row.methods){
  if(typeof evidence.file!=='string'||!/^node_modules\/baileys\/lib\/[A-Za-z0-9_./-]+$/.test(evidence.file)||evidence.file.split('/').includes('..')||typeof evidence.name!=='string'||!evidence.name)throw Error('Invalid evidence: '+row.id);
  const source=readFileSync(resolve(root,evidence.file),'utf8');
  if(!source.includes(evidence.name))throw Error('Missing source symbol: '+row.id+' '+evidence.name);
 }
}
if(seen.size!==ids.size)throw Error('Audit does not cover every inventoried method');
const byId=new Map(rows.map(row=>[row.id,row]));
for(const capability of matrix.capabilities){
 const {id,...audit}=byId.get(capability.id);
 capability.baileys_audit={version,...audit};
}
matrix.baileys_audit={version,reviewed_at:new Date().toISOString(),scope:'Installed public declarations and source; candidate support is not implementation or verified equivalence.'};
writeFileSync(resolve(root,'public/whapi-capabilities.json'),JSON.stringify(matrix,null,2)+'\n');
console.log(JSON.stringify({methods:rows.length,version,counts:rows.reduce((counts,row)=>(counts[row.support]=(counts[row.support]||0)+1,counts),{})}));
