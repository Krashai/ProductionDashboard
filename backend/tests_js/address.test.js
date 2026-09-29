import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAddress, formatAddress, typesForWidth, suggestedType } from '../app/static/admin/address.js';

test('parsuje adresy TIA Portal (także z % i małymi literami)', () => {
  assert.deepEqual(parseAddress('DB6.DBD112'), { ok: true, db: 6, offset: 112, bit: 0, width: 'D' });
  assert.deepEqual(parseAddress(' %db4.dbx28.3 '), { ok: true, db: 4, offset: 28, bit: 3, width: 'X' });
  assert.deepEqual(parseAddress('DB6.DBW40'), { ok: true, db: 6, offset: 40, bit: 0, width: 'W' });
  assert.deepEqual(parseAddress('DB50.DBB0'), { ok: true, db: 50, offset: 0, bit: 0, width: 'B' });
});

test('odrzuca adresy niepełne lub spoza zakresu z polskim komunikatem', () => {
  for (const bad of ['', 'DB6', 'DB6.DBD', 'DB6.DBX28', 'DB6.DBX28.8', 'M10.0', 'DB70000.DBD0']) {
    const result = parseAddress(bad);
    assert.equal(result.ok, false, bad);
    assert.match(result.error, /\p{L}/u);
  }
});

test('szerokość adresu wyznacza możliwe typy', () => {
  assert.deepEqual(typesForWidth('X'), ['BOOL']);
  assert.deepEqual(typesForWidth('B'), ['BYTE', 'STRING']);
  assert.deepEqual(typesForWidth('W'), ['INT', 'WORD']);
  assert.deepEqual(typesForWidth('D'), ['REAL', 'DINT']);
});

test('formatAddress odwraca parseAddress', () => {
  assert.equal(formatAddress('REAL', 6, 112, 0), 'DB6.DBD112');
  assert.equal(formatAddress('BOOL', 4, 28, 3), 'DB4.DBX28.3');
  assert.equal(formatAddress('WORD', 6, 40, 0), 'DB6.DBW40');
  assert.equal(formatAddress('STRING', 6, 10, 0), 'DB6.DBB10');
});

test('typ podpowiadany z metryki i szerokości adresu', () => {
  assert.equal(suggestedType('chlodnia-1-v101-awaria', 'X'), 'BOOL');
  assert.equal(suggestedType('chlodnia-3-rhoss-awaria-2', 'X'), 'BOOL');
  assert.equal(suggestedType('chlodnia-1-temp', 'D'), 'REAL');
  assert.equal(suggestedType('chlodnia-1-diag', 'W'), 'WORD');
  assert.equal(suggestedType('chlodnia-1-diag', 'B'), 'BYTE');
});
