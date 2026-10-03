import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { summarizeCapabilityFieldCoverage } from './whapi-field-coverage.mjs';

test('getgroup ID requires group evidence even when unrelated chat IDs are fresh', () => {
  const scope = { window: {}, capabilities() {}, fmt: String, exactObservedPath: v => v };
  vm.runInNewContext(readFileSync(new URL('./public/whapi-field-aliases.js', import.meta.url), 'utf8'), scope);
  vm.runInNewContext(readFileSync(new URL('./public/capability-audit.js', import.meta.url), 'utf8'), scope);
  const method = JSON.parse(readFileSync(new URL('../public/whapi-fields.json', import.meta.url), 'utf8')).methods.find(m => m.id === 'getgroup');
  const reference = { methods: [{ ...method, operations: method.operations.map(op => ({ ...op, response_fields: { 200: op.response_fields['200'].filter(f => f.path === 'id') } })) }] };
  scope.window.WIS_COVERAGE_AVAILABLE = true;
  for (const state of ['absent', 'fresh', 'stale']) {
    const rows = ['chat', 'conversations'].map(kind => ({ kind, records: 9, total: 9, field: 'id', stale_records: 0 }));
    if (state !== 'absent') rows.push({ kind: 'group', records: 1, total: 1, field: 'id', stale_records: state === 'stale' ? 1 : 0 });
    const coverage = { snapshot_kinds: rows.map(row => ({ kind: row.kind, records: row.records, field_counts: [row] })) };
    const totals = summarizeCapabilityFieldCoverage(reference, coverage, scope.window.WIS_WHAPI_FIELD_ALIASES).totals;
    assert.equal(totals.exact_response_fields_observed, 0);
    assert.equal(totals.semantic_response_fields_observed, state === 'absent' ? 0 : 1);
    assert.equal(totals.fresh_response_fields_observed, state === 'fresh' ? 1 : 0);
    scope.window.WIS_OBSERVED_FIELD_MAP = new Map([['id', rows]]);
    const evidence = scope.observedVariableEvidence({ capability_id: 'getgroup', field_path: 'id', direction: 'response' });
    assert.doesNotMatch(evidence, /Ruta exacta|9\/9/);
    assert.match(evidence, state === 'absent' ? /sin observación/ : /group.id/);
    if (state === 'stale') assert.match(evidence, /marcados obsoletos/);
  }
});
