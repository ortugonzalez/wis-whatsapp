import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {endpoint} from '@/lib/api/core';
export const GET=endpoint(async ()=>Response.json(JSON.parse(await readFile(join(process.cwd(),'docs/api.openapi.json'),'utf8')),{headers:{'Cache-Control':'no-store'}}));
