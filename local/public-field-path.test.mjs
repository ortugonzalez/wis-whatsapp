import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./public/live.js', import.meta.url), 'utf8');
const declaration = source.match(/function exactObservedPath\(value\)\{[^\n]+\}/)?.[0];
if (!declaration) throw new Error('exactObservedPath_not_found');
const normalize = runInNewContext(`${declaration}; exactObservedPath`);

test('observed field paths normalize roots, safe quoted keys and array indexes', () => {
  assert.equal(normalize('$.name'), 'name');
  assert.equal(normalize('$."business_hours".config[0]."day_of_week"'), 'business_hours.config[].day_of_week');
  assert.equal(normalize('$.items[4].status.setAt'), 'items[].status.setAt');
});

test('quoted literal keys retain dots, indexes and escaped quotes', () => {
  assert.equal(normalize('$."item[0]"'), '"item[0]"');
  assert.equal(normalize('$."item[1]"'), '"item[1]"');
  assert.notEqual(normalize('$."item[0]"'), normalize('$."item[1]"'));
  assert.equal(normalize('$."item.name".value'), '"item.name".value');
  assert.equal(normalize('$."item\\\"[0]".value'), '"item\\\"[0]".value');
});
