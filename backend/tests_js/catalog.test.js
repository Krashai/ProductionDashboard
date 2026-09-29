import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSections, coverage } from '../app/static/admin/catalog.js';

const area = {
  id: 'chlodnia-1',
  metrics: [
    { id: 'chlodnia-1-temp', label: 'Temperatura', unit: '°C', decimals: 1 },
    { id: 'chlodnia-1-v101-praca', label: 'V101 — Praca', unit: '', decimals: 0 },
    { id: 'chlodnia-1-v101-awaria', label: 'V101 — Awaria', unit: '', decimals: 0 },
  ],
  device_groups: [{ id: 'sprezarki', label: 'Sprężarki', devices: [
    { id: 'v101', label: 'V101', metric_ids: { praca: 'chlodnia-1-v101-praca', awaria: 'chlodnia-1-v101-awaria' } },
  ] }],
};

const tags = [
  { id: 1, plc_id: 7, metric_id: 'chlodnia-1-temp', label: 'Temperatura' },
  { id: 2, plc_id: 7, metric_id: 'chlodnia-1-diag-aw1', label: 'Słowo awarii 1' },
  { id: 3, plc_id: 9, metric_id: 'chlodnia-2-temp', label: 'Inny obszar' },
];

test('sekcje: odczyty, grupy urządzeń jak na wallboardzie, tagi diagnostyczne', () => {
  const sections = buildSections(area, tags, new Set([7]));

  assert.deepEqual(sections.map((s) => s.title), ['Odczyty', 'Sprężarki', 'Słowa awarii i tagi diagnostyczne']);
  assert.deepEqual(sections[0].rows.map((r) => [r.metric.id, r.tag?.id ?? null]), [['chlodnia-1-temp', 1]]);
  assert.deepEqual(sections[1].rows.map((r) => r.metric.id), ['chlodnia-1-v101-praca', 'chlodnia-1-v101-awaria']);
  assert.deepEqual(sections[2].rows.map((r) => r.tag.id), [2]);
  assert.equal(sections[2].rows[0].metric, null);
});

test('obszar bez grup urządzeń grupuje po trafostacjach', () => {
  const energia = { id: 'energia-elektryczna', metrics: [
    { id: 'trafostacja-1-active', label: 'Moc czynna' }, { id: 'trafostacja-2-active', label: 'Moc czynna' }] };
  assert.deepEqual(buildSections(energia, [], new Set()).map((s) => s.title), ['Trafostacja 1', 'Trafostacja 2']);
});

test('pokrycie liczy tylko metryki katalogu', () => {
  assert.deepEqual(coverage(area, tags), { configured: 1, total: 3 });
});
