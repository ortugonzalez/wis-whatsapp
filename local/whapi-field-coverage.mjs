function exactObservedPath(value) {
  const source=value.startsWith('$.')?value.slice(2):value.startsWith('$')?value.slice(1):value;
  let path='';
  for(let i=0;i<source.length;){
    const char=source[i];
    if(char==='"'){
      let end=i+1,escaped=false;
      for(;end<source.length;end++){const next=source[end];if(escaped){escaped=false;continue;}if(next==='\\'){escaped=true;continue;}if(next==='"')break;}
      const raw=source.slice(i,end<source.length?end+1:end),key=source.slice(i+1,end),before=i===0||source[i-1]==='.',after=end+1>=source.length||source[end+1]==='.'||source[end+1]==='[';
      path+=before&&after&&/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)?key:raw;i=end<source.length?end+1:end;continue;
    }
    if(char==='['){const match=/^\[(\d+)\]/.exec(source.slice(i));if(match){path+='[]';i+=match[0].length;continue;}}
    path+=char;i++;
  }
  return path;
}

function inventoryRows(method){
  const rows=[];
  for(const operation of method.operations||[]){
    const operationKey=operation.operation_id||`${operation.method||''} ${operation.path||''}`;
    for(const parameter of operation.parameters||[])rows.push({operation_key:operationKey,direction:'parameter',path:parameter.name||''});
    for(const field of operation.request_fields||[])rows.push({operation_key:operationKey,direction:'request',path:field.path||''});
    for(const fields of Object.values(operation.response_fields||{}))for(const field of fields||[])rows.push({operation_key:operationKey,direction:'response',path:field.path||''});
  }
  return rows;
}

const localOnlyPaths=new Set(['source','last_message.source','messages[].source']);

export function summarizeCapabilityFieldCoverage(reference,coverage,aliases={}){
  const observed=new Map();
  const add=(kind,rows)=>{for(const row of rows||[]){if(typeof row.field!=='string')continue;const key=`${kind}\0${exactObservedPath(row.field)}`;const prior=observed.get(key)||{records:0,non_empty_text_records:0};prior.records=Math.max(prior.records,row.records||0);prior.non_empty_text_records=Math.max(prior.non_empty_text_records,row.non_empty_text_records||0);observed.set(key,prior);}};
  for(const section of ['snapshot_kinds','storage_kinds','contextual_kinds'])for(const row of coverage?.[section]||[])add(row.kind,row.field_counts);
  const methods=(reference?.methods||[]).map(method=>{
    const seen=new Set(),definitionRows=inventoryRows(method).filter(row=>{const key=`${row.operation_key}\0${row.direction}\0${row.path}`;if(seen.has(key))return false;seen.add(key);return Boolean(row.path);}),responseRows=definitionRows.filter(row=>row.direction==='response'),alias=aliases[method.id]||{};
    const sourceKinds=Array.isArray(alias.source_kinds)?alias.source_kinds:[];
    let exact=0,semantic=0;
    for(const row of responseRows){
      const path=exactObservedPath(row.path);
      if(localOnlyPaths.has(path)||(alias.non_equivalent_fields||[]).some(value=>exactObservedPath(value)===path))continue;
      const candidates=alias.fields?.[row.path]||[];
      if(candidates.some(candidate=>{
        const value=observed.get(`${candidate.kind}\0${exactObservedPath(candidate.field)}`);
        return !localOnlyPaths.has(exactObservedPath(candidate.field))&&Boolean(value)&&value.records>0&&(!candidate.requires_non_empty_text||value.non_empty_text_records>0);
      })){semantic++;continue;}
      const exactRows=sourceKinds.map(kind=>({kind,value:observed.get(`${kind}\0${path}`)})).filter(item=>item.value&&item.value.records>0);
      const hasExact=exactRows.some(item=>!((alias.fields?.[row.path]||[]).some(candidate=>candidate.kind===item.kind&&exactObservedPath(candidate.field)===path&&candidate.requires_non_empty_text)&&item.value.non_empty_text_records<=0));
      if(hasExact){exact++;continue;}
    }
    return {id:method.id,parameter_fields:definitionRows.filter(row=>row.direction==='parameter').length,request_fields:definitionRows.filter(row=>row.direction==='request').length,response_fields:responseRows.length,exact_response_fields_observed:exact,semantic_response_fields_observed:semantic,response_fields_without_observation:Math.max(0,responseRows.length-exact-semantic)};
  });
  const responseMethods=methods.filter(row=>row.response_fields>0),hasObservedResponse=row=>row.exact_response_fields_observed+row.semantic_response_fields_observed>0;
  const methodCoverage={response_methods:responseMethods.length,methods_with_any_observed_response:responseMethods.filter(hasObservedResponse).length,methods_without_observed_response:responseMethods.filter(row=>!hasObservedResponse(row)).length,methods_with_all_response_fields_observed:responseMethods.filter(row=>row.response_fields_without_observation===0).length};
  return {captured_at:reference?.captured_at??null,observed_at:new Date().toISOString(),method_count:methods.length,method_coverage:methodCoverage,totals:methods.reduce((sum,row)=>({parameter_fields:sum.parameter_fields+row.parameter_fields,request_fields:sum.request_fields+row.request_fields,response_fields:sum.response_fields+row.response_fields,exact_response_fields_observed:sum.exact_response_fields_observed+row.exact_response_fields_observed,semantic_response_fields_observed:sum.semantic_response_fields_observed+row.semantic_response_fields_observed,response_fields_without_observation:sum.response_fields_without_observation+row.response_fields_without_observation}),{parameter_fields:0,request_fields:0,response_fields:0,exact_response_fields_observed:0,semantic_response_fields_observed:0,response_fields_without_observation:0}),methods};
}
