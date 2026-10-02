import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./public/live.js', import.meta.url), 'utf8');
const maskDeclaration = source.match(/function maskedConnectionLabel\(phone\)\{[^\n]+\}/)?.[0];
if (!maskDeclaration) throw new Error('masked_connection_label_not_found');
const maskedLabel = runInNewContext(`${maskDeclaration}; maskedConnectionLabel`);
const declaration = source.match(/function exactObservedPath\(value\)\{[^\n]+\}/)?.[0];
if (!declaration) throw new Error('exactObservedPath_not_found');
const normalize = runInNewContext(`${declaration}; exactObservedPath`);

test('overview connection label exposes only the last four digits', () => {
  assert.equal(maskedLabel('+54 9 11 1234 5679'), 'Línea ··· 5679');
  assert.equal(maskedLabel('123'), 'Línea vinculada');
  assert.equal(maskedLabel(null), 'Línea vinculada');
});

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
