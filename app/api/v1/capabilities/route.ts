import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {context,endpoint,result} from '@/lib/api/core';
export const GET=endpoint(async r=>{await context(r);return result(JSON.parse(await readFile(join(process.cwd(),'public/whapi-capabilities.json'),'utf8')));});

