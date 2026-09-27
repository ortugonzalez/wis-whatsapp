import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPublicCatalogReader,PublicCatalogError} from '../../local/catalog-http.mjs';
test('QA: malformed public catalog rows cannot become verified records',async()=>{
 const cases=[['catalog',null],['catalog',{data:{xwa_product_catalog_get_product_catalog:{product_catalog:{products:[null,{}]}}}}],['collections',{data:{xwa_product_catalog_get_collections:{collections:[null]}}}],['collections',{data:{xwa_product_catalog_get_collections:{collections:[{}]}}}]];
 for(const [kind,body] of cases){
  const reader=createPublicCatalogReader({ownJid:'5491111115679@s.whatsapp.net',discover:async()=>({token:'WA|FAKE_TEST_ONLY',catalog:'30445081048424116',collections:'9430970660362540'}),fetchImpl:async()=>new Response(JSON.stringify(body))});
  await assert.rejects(reader[kind](),error=>error instanceof PublicCatalogError && error.code==='invalid_catalog_response');
 }
});
