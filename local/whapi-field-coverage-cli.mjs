import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {buildDataCoverage} from './data-coverage.mjs';
import {summarizeCapabilityFieldCoverage} from './whapi-field-coverage.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const databasePath=process.env.WIS_DB_PATH||resolve(root,'.local/wis.sqlite');
const database=new DatabaseSync(databasePath,{readOnly:true});
try{
  const reference=JSON.parse(readFileSync(resolve(root,'public/whapi-fields.json'),'utf8'));
  const sandbox={window:{}};
  runInNewContext(readFileSync(resolve(root,'local/public/whapi-field-aliases.js'),'utf8'),sandbox,{timeout:1000});
  const report=summarizeCapabilityFieldCoverage(reference,buildDataCoverage(database),sandbox.window.WIS_WHAPI_FIELD_ALIASES||{});
  const latestSnapshot=database.prepare('SELECT max(updated_at) AS updated_at FROM snapshots').get()?.updated_at;
  report.source_database=process.env.WIS_DB_PATH?'configured_WIS_DB_PATH':'repository_local_default';
  report.latest_snapshot_updated_at=typeof latestSnapshot==='string'&&Number.isFinite(Date.parse(latestSnapshot))?new Date(latestSnapshot).toISOString():null;
  const observedCount=row=>row.exact_response_fields_observed+row.semantic_response_fields_observed;
  const output=process.argv.includes('--summary')?{captured_at:report.captured_at,observed_at:report.observed_at,source_database:report.source_database,latest_snapshot_updated_at:report.latest_snapshot_updated_at,method_count:report.method_count,method_coverage:report.method_coverage,totals:report.totals,leastObserved:report.methods.filter(row=>row.response_fields>0).sort((a,b)=>observedCount(a)-observedCount(b)||b.response_fields-a.response_fields).slice(0,12),mostObserved:report.methods.filter(row=>row.response_fields>0).sort((a,b)=>observedCount(b)-observedCount(a)||a.response_fields-b.response_fields).slice(0,12)}:report;
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}finally{database.close();}
