import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, bitIsSet, slugify } from '../app/static/admin/format.js';

test('formatuje wartości po polsku', () => {
  assert.equal(formatValue(6.4, 'REAL', '°C', 1), '6,4 °C');
  assert.equal(formatValue(1234.5, 'REAL', 'kW', 0), '1235 kW');
  assert.equal(formatValue(1, 'BOOL', '', 0), 'TRUE');
  assert.equal(formatValue(0, 'BOOL', '', 0), 'FALSE');
  assert.equal(formatValue(null, 'REAL', '°C', 1), '—');
  assert.equal(formatValue(9, 'WORD', '', 0), '9');
});

test('stan bitu', () => {
  assert.equal(bitIsSet(0b1001, 0), true);
  assert.equal(bitIsSet(0b1001, 1), false);
  assert.equal(bitIsSet(0b1001, 3), true);
  assert.equal(bitIsSet(null, 3), false);
});

test('slug z polskiej nazwy', () => {
  assert.equal(slugify('Słowo awarii 1 — Pompy'), 'slowo-awarii-1-pompy');
});
