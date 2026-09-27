import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let inventoryPromise;

async function loadInventory(root) {
  inventoryPromise ??= readFile(resolve(root, 'public/whapi-fields.json'), 'utf8').then(JSON.parse).catch(error => {
    inventoryPromise = undefined;
    throw error;
  });
  return inventoryPromise;
}

function fieldRows(method) {
  const rows = [];
  for (const operation of method.operations ?? []) {
    const details = {
      operation_id: operation.operation_id ?? '',
      endpoint_method: operation.method ?? '',
      endpoint_path: operation.path ?? '',
      tags: Array.isArray(operation.tags) ? operation.tags : [],
    };
    for (const field of operation.request_fields ?? []) rows.push({ ...details, direction: 'request', response_status: null, ...field });
    for (const [status, fields] of Object.entries(operation.response_fields ?? {})) {
      for (const field of fields ?? []) rows.push({ ...details, direction: 'response', response_status: status, ...field });
    }
  }
  return rows;
}

export async function searchCapabilityFields(root, query, limit = 100) {
  const q = typeof query === 'string' ? query.trim().toLocaleLowerCase('en') : '';
  if (q.length < 2 || q.length > 100) return { query: q, total: 0, results: [] };
  const inventory = await loadInventory(root);
  const results = [];
  let total = 0;
  for (const method of inventory.methods ?? []) {
    const rows = fieldRows(method);
    const methodContext = `${method.id ?? ''} ${method.version ?? ''}`;
    for (const row of rows) {
      const searchable = `${methodContext} ${row.operation_id} ${row.endpoint_method} ${row.endpoint_path} ${row.tags.join(' ')} ${row.path ?? ''} ${row.type ?? ''} ${row.description ?? ''}`.toLocaleLowerCase('en');
      if (!searchable.includes(q)) continue;
      total++;
      if (results.length < limit) results.push({
        capability_id: method.id,
        operation_id: row.operation_id,
        endpoint_method: row.endpoint_method,
        endpoint_path: row.endpoint_path,
        tags: row.tags,
        direction: row.direction,
        response_status: row.response_status,
        field_path: row.path,
        type: row.type,
        required: row.required === true,
        description: typeof row.description === 'string' ? row.description.slice(0, 300) : '',
      });
    }
  }
  return { query: q, total, results, captured_at: inventory.captured_at, source: inventory.source };
}
